import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Classification, OhgoKind, PhotoDraft } from './classify.mts';
import { buildPhotoDraft, classifyPost, validatePhotoDraft } from './classify.mts';
import type { EditMap, ImageEdit, ImageEditor } from './image-edit.mts';
import { createBrowserImageEditor, editedFileName, ImageEditError, isNoopEdit, readEdits, uploadFileFor, writeEdits } from './image-edit.mts';
import { createBrowserReencoder, extOf, prepareImage } from './image-prep.mts';
import type { Reencode } from './image-prep.mts';
import type { LedgerEntry } from './ledger.mts';
import { findLedgerEntry, recordLedgerEntry } from './ledger.mts';
import type { OhgoCredentials } from './ohgo-auth.mts';
import { clearOhgoSession, ensureFreshSession, loginOhgo, OhgoAuthError, readOhgoSession, saveOhgoSession } from './ohgo-auth.mts';
import { newPhotoObjectPath, OhgoClient } from './ohgo-client.mts';
import { resolvePostImages } from './post-images.mts';
import type { ImageRecord, PushRecorder } from './push-log.mts';
import { createPushRecorder, PUSH_LOG_FILE } from './push-log.mts';
import { formattedBody } from './rich-text.mts';
import type { FormattedBody } from './rich-text.mts';
import type { Fetch, OhgoConfig } from './ohgo-config.mts';
import { projectRefFromUrl, resolveOhgoConfig } from './ohgo-config.mts';
import type { ExtractedPost } from './schema.mts';
import { validateExtracted } from './schema.mts';
import type { TripDraft } from './trip-parse.mts';
import { catchBoardTime, kstTime, parseTripGuide, postRefDate, validateTripDraft } from './trip-parse.mts';

export type Log = (msg: string) => void;

export type OhgoState = {
  baseUrl: string | null;
  supabaseUrl: string | null;
  configError: string | null;
  user: { name: string; userId: string; savedAt: string } | null;
};

export type PrepareResult = {
  postId: string;
  bandId: string;
  sourceUrl: string;
  title: string;
  /** 게시일(KST). 날짜 칸의 "10/12" 같은 입력을 해석하는 기준 */
  refDate: string;
  /** Band 글이 올라간 시각. 없으면 화면으로 가져온 글 */
  sourceCreatedAt: string | null;
  classification: Classification;
  photo: PhotoDraft;
  /** extracted.json과 폴더의 사진이 어긋날 때 알림 */
  photoWarnings: string[];
  /** 원본 파일 이름 → 편집본. 등록하면 편집본을 올린다 */
  photoEdits: EditMap;
  /** Band 본문 서식을 살린 내용. html이 null이면 살릴 서식이 없다 */
  photoFormatted: FormattedBody;
  trip: TripDraft;
  tripSource: 'weekly' | 'single';
  tripMissing: string[];
  tripHints: string[];
  /** 날짜별로 앱에 이미 있는 출조 일정("06:00 낫개 감성돔") */
  tripDuplicates: Record<string, string[]>;
  ledger: LedgerEntry | null;
  remoteWarnings: string[];
};

export type PushRequest = {
  postId: string;
  kind: OhgoKind;
  photo?: PhotoDraft;
  trip?: TripDraft;
  /** 장부에 이미 있어도 다시 등록 */
  force?: boolean;
};

export type PushResult = {
  kind: OhgoKind;
  target: LedgerEntry['target'];
  rowIds: string[];
  links: string[];
  title: string;
  resizedImages: number;
};

export class OhgoRequestRejected extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status = 400, code: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type OhgoService = {
  state(): Promise<OhgoState>;
  login(creds: OhgoCredentials): Promise<OhgoState>;
  logout(): Promise<OhgoState>;
  prepare(postId: string): Promise<PrepareResult>;
  /** 동기 검사. 문제가 있으면 OhgoRequestRejected를 던진다 */
  checkPush(req: PushRequest): void;
  push(req: PushRequest, log: Log): Promise<PushResult>;
  /** 사진 한 장을 편집해 edited_NN 파일로 저장한다. 원본은 그대로 둔다 */
  editImage(postId: string, file: string, edit: ImageEdit): Promise<EditMap>;
  /** 편집본을 지우고 원본으로 되돌린다 */
  revertImage(postId: string, file: string): Promise<EditMap>;
  isAppLink(url: string): boolean;
};

export type OhgoServiceOptions = {
  /** 세션과 장부를 두는 폴더 */
  dir: string;
  outRoot: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: Fetch;
  createReencoder?: () => Promise<{ reencode: Reencode; close: () => Promise<void> }>;
  createImageEditor?: () => Promise<ImageEditor>;
  /** 사진 사이 간격(ms) */
  uploadGapMs?: number;
};

function loadExtracted(outRoot: string, postId: string): ExtractedPost {
  if (!/^\d+$/.test(postId)) throw new OhgoRequestRejected('잘못된 게시글 번호입니다');
  const path = join(outRoot, postId, 'extracted.json');
  if (!existsSync(path)) throw new OhgoRequestRejected('가져온 결과가 없습니다. 먼저 가져오기를 하세요.', 404);
  const post = JSON.parse(readFileSync(path, 'utf8'));
  const errors = validateExtracted(post);
  if (errors.length) throw new OhgoRequestRejected(`extracted.json 형식 오류: ${errors.slice(0, 3).join(', ')}`);
  return post as ExtractedPost;
}

/** 제목으로 뺀 첫 줄을 description과 같은 기준으로 뺀 서식 본문 */
function postFormatted(post: ExtractedPost, title: string): FormattedBody {
  return formattedBody(post.rawContent, [post.title, title]);
}

function tripTitle(draft: TripDraft): string {
  const dates = [...new Set(draft.rows.map((r) => r.date))].sort();
  const span = dates.length > 1 ? `${dates[0]} ~ ${dates[dates.length - 1]}` : dates[0] ?? '';
  return `${span} ${draft.destination.trim()} ${draft.rows.length}건`;
}

function eqParam(value: string): string {
  return `eq.${encodeURIComponent(value)}`;
}

/** 단계별 실패. 메시지를 그대로 화면에 보여 준다 */
export class PushStepError extends Error {}

/** 저장한 글의 image_urls가 올린 사진과 같고, 공개 주소로 열리는지 본다. 문제가 없으면 null */
async function verifySavedPhotos(client: OhgoClient, fetchImpl: Fetch, rowId: string, urls: string[]): Promise<string | null> {
  let saved;
  try {
    saved = await client.select('community_photos', `select=id,image_urls&id=${eqParam(rowId)}`);
  } catch (err) {
    return `글을 다시 읽지 못했습니다: ${(err as Error).message}`;
  }
  const got = saved[0]?.image_urls;
  if (!saved.length) return '글이 보이지 않습니다';
  if (!Array.isArray(got) || got.length === 0) return `사진 목록(image_urls)이 비어 있습니다 (올린 사진 ${urls.length}장)`;
  if (got.length !== urls.length || got.some((u, i) => u !== urls[i])) {
    return `사진 목록(image_urls)이 올린 사진과 다릅니다 (저장 ${got.length}장, 올린 사진 ${urls.length}장)`;
  }
  for (const [i, url] of urls.entries()) {
    const res = await fetchImpl(url, { method: 'HEAD' }).catch((e: Error) => e);
    if (res instanceof Error) return `사진 ${i + 1}을 열지 못했습니다: ${res.message}`;
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) return `사진 ${i + 1}이 앱에서 열리지 않습니다 (HTTP ${res.status}${type ? `, ${type}` : ''})`;
  }
  return null;
}

export function createOhgoService(opts: OhgoServiceOptions): OhgoService {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const env = opts.env ?? process.env;
  let configPromise: Promise<OhgoConfig> | null = null;

  const config = () => {
    configPromise ??= resolveOhgoConfig(env, fetchImpl).catch((err) => {
      configPromise = null;
      throw err;
    });
    return configPromise;
  };

  const state = async (): Promise<OhgoState> => {
    let cfg: OhgoConfig | null = null;
    let configError: string | null = null;
    try {
      cfg = await config();
    } catch (err) {
      configError = (err as Error).message;
    }
    const session = readOhgoSession(opts.dir);
    const user = session && cfg && session.supabaseUrl === cfg.supabaseUrl ? { name: session.name, userId: session.userId, savedAt: session.savedAt } : null;
    return { baseUrl: cfg?.baseUrl ?? null, supabaseUrl: cfg?.supabaseUrl ?? null, configError, user };
  };

  const checkPush = (req: PushRequest) => {
    const post = loadExtracted(opts.outRoot, req.postId);
    if (req.kind === 'catch') {
      if (!req.photo) throw new OhgoRequestRejected('조황 게시판 입력값이 없습니다');
      const errors = validatePhotoDraft(req.photo);
      const outDir = join(opts.outRoot, req.postId);
      const missing = req.photo.images.filter((f) => !existsSync(join(outDir, f)));
      if (missing.length) errors.push(`사진 파일이 없습니다: ${missing.join(', ')}`);
      if (errors.length) throw new OhgoRequestRejected(errors.join('\n'));
    } else if (req.kind === 'schedule') {
      if (!req.trip) throw new OhgoRequestRejected('출조 일정 입력값이 없습니다');
      const errors = validateTripDraft(req.trip);
      if (errors.length) throw new OhgoRequestRejected(errors.join('\n'));
    } else {
      throw new OhgoRequestRejected('등록 종류가 잘못되었습니다');
    }
    const session = readOhgoSession(opts.dir);
    if (!session) throw new OhgoRequestRejected('오고피씽 관리자 로그인이 필요합니다', 401);
    const project = projectRefFromUrl(session.supabaseUrl);
    const dup = findLedgerEntry(opts.dir, project, post.source.bandId, post.source.postId);
    if (dup && !req.force) {
      throw new OhgoRequestRejected(
        `이미 등록한 게시글입니다 (${dup.registeredAt.slice(0, 16).replace('T', ' ')}, ${dup.target === 'community_photos' ? '조황 게시판' : '출조 일정'}). 다시 등록하려면 "그래도 다시 등록"을 체크하세요.`,
        409,
        'DUPLICATE',
      );
    }
  };

  const pushCatch = async (
    cfg: OhgoConfig,
    client: OhgoClient,
    post: ExtractedPost,
    draft: PhotoDraft,
    session: { userId: string; name: string },
    log: Log,
    rec: PushRecorder,
    checkFetch: Fetch,
  ) => {
    const outDir = join(opts.outRoot, post.source.postId);
    const uploaded: string[] = [];
    const urls: string[] = [];
    let resized = 0;
    let rowId: string | null = null;
    const edits = readEdits(outDir);
    const total = draft.images.length;
    const encoder = await (opts.createReencoder ?? createBrowserReencoder)();
    try {
      for (const [i, original] of draft.images.entries()) {
        const file = uploadFileFor(outDir, original, edits);
        const image: ImageRecord = {
          n: i + 1,
          original,
          file,
          fileBytes: null,
          uploadBytes: null,
          contentType: null,
          resized: false,
          objectPath: null,
          ok: false,
          error: null,
        };
        rec.run.images.push(image);
        const label = `사진 ${i + 1}/${total} (${file === original ? file : `${original}의 편집본 ${file}`})`;
        if (file !== original) log(`사진 ${original}: 편집한 사진(${file})을 올립니다`);
        let prepared;
        try {
          const bytes = readFileSync(join(outDir, file));
          image.fileBytes = bytes.length;
          if (bytes.length === 0) throw new Error('파일이 비어 있습니다');
          prepared = await prepareImage(bytes, file, encoder.reencode);
        } catch (err) {
          image.error = (err as Error).message;
          throw new PushStepError(`${label} 준비 실패: ${image.error}`);
        }
        image.uploadBytes = prepared.bytes.length;
        image.contentType = prepared.contentType;
        image.resized = prepared.resized;
        if (prepared.resized) {
          resized++;
          log(`사진 ${file}: ${(prepared.originalBytes / 1048576).toFixed(1)}MB → ${(prepared.bytes.length / 1048576).toFixed(1)}MB로 줄였습니다`);
        }
        const path = newPhotoObjectPath(prepared.ext);
        image.objectPath = path;
        log(`사진 올리는 중 ${i + 1}/${total} (${(prepared.bytes.length / 1048576).toFixed(1)}MB)`);
        try {
          urls.push(await client.uploadPhoto(path, prepared.bytes, prepared.contentType));
        } catch (err) {
          image.error = (err as Error).message;
          throw new PushStepError(`${label} 올리기 실패: ${image.error}`);
        }
        image.ok = true;
        uploaded.push(path);
        rec.save();
        if (opts.uploadGapMs) await new Promise((r) => setTimeout(r, opts.uploadGapMs));
      }
      if (urls.length !== total) throw new PushStepError(`사진 ${total}장 중 ${urls.length}장만 올라갔습니다`);
      const row: Record<string, unknown> = {
        uploaded_by: session.userId,
        uploaded_by_name: session.name,
        title: draft.title.trim(),
        description: draft.description,
        image_urls: urls,
        comment_count: 0,
        board_type: 'photo',
      };
      if (draft.photoDate) {
        row.photo_date = draft.photoDate;
        // 게시판 목록과 상세는 photo_date가 아니라 created_at으로 정렬하고 보여 준다
        row.created_at = catchBoardTime(draft.photoDate, post.createdAt);
        const hm = kstTime(String(row.created_at));
        log(`게시판에는 ${draft.photoDate} ${hm} (한국 시간)로 올리고, 그 시각 순서로 둡니다`);
      } else {
        log('사진 날짜가 없어 게시판에는 지금 시각으로 올립니다');
      }
      if (draft.useFormatting) {
        // 화면에서 온 HTML은 받지 않고 extracted.json에서 다시 만든다
        const html = postFormatted(post, buildPhotoDraft(post).title).html;
        if (html) {
          row.content = html;
          log('Band 본문의 글자색과 굵게를 살려 올립니다');
        }
      }
      log('조황 게시판에 글을 저장하는 중');
      try {
        rowId = await client.insert('community_photos', row, ['uploaded_by_name', 'photo_date', 'board_type']);
      } catch (err) {
        throw new PushStepError(`조황 게시판 저장 실패: ${(err as Error).message}`);
      }
      log(`저장한 글을 다시 읽어 사진 ${total}장을 확인하는 중`);
      const problem = await verifySavedPhotos(client, checkFetch, rowId, urls);
      if (problem) throw new PushStepError(`저장한 글을 확인해 보니 ${problem}`);
      log(`앱에서 사진 ${total}장이 열리는 것을 확인했습니다`);
      return { rowIds: [rowId], links: [`${cfg.baseUrl}/community/${rowId}`], resized };
    } catch (err) {
      const notes: string[] = [];
      let rowLeft = false;
      if (rowId) {
        log('확인에 실패해 저장한 글을 지웁니다');
        try {
          await client.deleteRow('community_photos', rowId);
          notes.push('저장한 글은 지웠습니다.');
        } catch (e) {
          rowLeft = true;
          log(`저장한 글 지우기 실패: ${(e as Error).message}`);
          notes.push(`저장한 글을 지우지 못했습니다. 앱에서 직접 지우세요: ${cfg.baseUrl}/community/${rowId}`);
        }
      } else {
        notes.push('조황 게시판에 글은 만들지 않았습니다.');
      }
      if (uploaded.length && !rowLeft) {
        log(`올린 사진 ${uploaded.length}장을 지웁니다`);
        try {
          const removed = await client.removePhotos(uploaded);
          const left = uploaded.filter((p) => !removed.includes(p));
          if (left.length) {
            log(`지우지 못한 사진: ${left.join(', ')}`);
            notes.push(`올린 사진 ${left.length}장은 서버 권한 때문에 지우지 못해 Storage에 남았습니다 (앱에는 안 보입니다).`);
          }
        } catch (e) {
          log(`올린 사진 정리 실패: ${(e as Error).message}`);
          notes.push(`올린 사진 ${uploaded.length}장을 지우지 못했습니다 (앱에는 안 보입니다).`);
        }
      }
      if (err instanceof PushStepError) err.message = `${err.message}\n${notes.join(' ')}`;
      throw err;
    } finally {
      await encoder.close();
    }
  };

  const pushTrip = async (cfg: OhgoConfig, client: OhgoClient, draft: TripDraft, log: Log) => {
    const ids: string[] = [];
    try {
      for (const [i, trip] of draft.rows.entries()) {
        const row: Record<string, unknown> = {
          date: trip.date,
          destination: draft.destination.trim(),
          departure_time: trip.departureTime,
        };
        if (trip.returnTime) row.return_time = trip.returnTime;
        if (trip.species.trim()) row.species = trip.species.trim();
        if (draft.capacity) row.capacity = draft.capacity;
        if (trip.price) row.price = trip.price;
        if (trip.notes.trim()) row.notes = trip.notes.trim();
        if (draft.contact.trim()) row.contact = draft.contact.trim();
        log(`출조 일정 저장 중 ${i + 1}/${draft.rows.length}: ${trip.date} ${trip.departureTime} ${row.destination}${row.species ? ` ${row.species}` : ''}`);
        ids.push(await client.insert('trip_guides', row, ['contact']));
      }
    } catch (err) {
      for (const id of ids) {
        await client.deleteRow('trip_guides', id).catch((e: Error) => log(`저장한 일정 정리 실패(${id}): ${e.message}`));
      }
      if (ids.length) log('일부만 저장되어 저장한 일정을 지웠습니다');
      throw err;
    }
    return { rowIds: ids, links: [`${cfg.baseUrl}/admin-trip-guide`], resized: 0 };
  };

  const editablePhoto = (postId: string, file: string) => {
    const post = loadExtracted(opts.outRoot, postId);
    const outDir = join(opts.outRoot, post.source.postId);
    if (!resolvePostImages(outDir, post).files.includes(file)) throw new OhgoRequestRejected(`편집할 수 없는 사진입니다: ${file}`);
    return outDir;
  };

  const revertImage = async (postId: string, file: string) => {
    const outDir = editablePhoto(postId, file);
    const edits = readEdits(outDir);
    rmSync(join(outDir, editedFileName(file)), { force: true });
    if (file in edits) {
      delete edits[file];
      writeEdits(outDir, edits);
    }
    return edits;
  };

  return {
    state,

    async login(creds) {
      const cfg = await config();
      const session = await loginOhgo(cfg, creds, fetchImpl);
      saveOhgoSession(opts.dir, session);
      return state();
    },

    async logout() {
      clearOhgoSession(opts.dir);
      return state();
    },

    async prepare(postId) {
      const post = loadExtracted(opts.outRoot, postId);
      const remoteWarnings: string[] = [];
      let known: string[] = [];
      let cfg: OhgoConfig | null = null;
      try {
        cfg = await config();
      } catch (err) {
        remoteWarnings.push((err as Error).message);
      }
      const reader = cfg ? new OhgoClient(cfg, null, fetchImpl) : null;
      if (reader) {
        try {
          const rows = await reader.select('trip_guides', 'select=destination&order=date.desc&limit=300');
          const counts = new Map<string, number>();
          for (const r of rows) {
            const name = String(r.destination ?? '').trim();
            if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
          }
          known = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
        } catch (err) {
          remoteWarnings.push(`앱의 기존 목적지를 읽지 못했습니다: ${(err as Error).message}`);
        }
      }
      const outDir = join(opts.outRoot, post.source.postId);
      const images = resolvePostImages(outDir, post);
      const allEdits = readEdits(outDir);
      const photoEdits = Object.fromEntries(Object.entries(allEdits).filter(([f]) => images.files.includes(f) && uploadFileFor(outDir, f, allEdits) !== f));
      const classification = classifyPost(post, images.files.length);
      const photo = buildPhotoDraft(post, images.files);
      const photoFormatted = postFormatted(post, photo.title);
      photo.useFormatting = photoFormatted.html !== null;
      const trip = parseTripGuide(post, known);

      const tripDuplicates: Record<string, string[]> = {};
      if (reader) {
        try {
          for (const title of new Set([photo.title, post.title.trim()].filter(Boolean))) {
            const same = await reader.select('community_photos', `select=id,created_at&board_type=eq.photo&title=${eqParam(title)}&order=created_at.desc&limit=3`);
            if (same.length) {
              remoteWarnings.push(`조황 게시판에 같은 제목의 글이 ${same.length}개 있습니다 (최근 ${String(same[0].created_at).slice(0, 10)})`);
              break;
            }
          }
          const dates = [...new Set(trip.draft.rows.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
          if (dates.length) {
            const same = await reader.select('trip_guides', `select=id,date,destination,departure_time,species&date=in.(${dates.join(',')})&order=departure_time.asc`);
            for (const date of dates) {
              const list = same
                .filter((r) => String(r.date).slice(0, 10) === date)
                .map((r) => [r.departure_time, r.destination, r.species].filter(Boolean).join(' '));
              if (!list.length) continue;
              tripDuplicates[date] = list;
              remoteWarnings.push(`${date}에 이미 등록된 출조 일정 ${list.length}개: ${list.join(', ')}`);
            }
          }
        } catch (err) {
          remoteWarnings.push(`앱에서 중복 확인을 하지 못했습니다: ${(err as Error).message}`);
        }
      }

      const project = cfg?.projectRef ?? null;
      return {
        postId: post.source.postId,
        bandId: post.source.bandId,
        sourceUrl: post.source.url,
        title: post.title,
        refDate: postRefDate(post),
        sourceCreatedAt: post.createdAt,
        classification,
        photo,
        photoWarnings: images.warnings,
        photoEdits,
        photoFormatted,
        trip: trip.draft,
        tripSource: trip.source,
        tripMissing: trip.missing,
        tripHints: trip.hints,
        tripDuplicates,
        ledger: project ? findLedgerEntry(opts.dir, project, post.source.bandId, post.source.postId) : null,
        remoteWarnings,
      };
    },

    checkPush,

    async push(req, outerLog) {
      checkPush(req);
      const post = loadExtracted(opts.outRoot, req.postId);
      const rec = createPushRecorder(join(opts.outRoot, post.source.postId), { postId: post.source.postId, kind: req.kind });
      const logFile = `out/${post.source.postId}/${PUSH_LOG_FILE}`;
      const log: Log = (msg) => {
        rec.note(msg);
        outerLog(msg);
      };
      const traced = rec.fetch(fetchImpl);
      let done;
      try {
        const cfg = await config();
        rec.run.supabase = cfg.projectRef;
        log('오고피씽 로그인 확인 중');
        let session;
        try {
          session = await ensureFreshSession(cfg, opts.dir, traced);
        } catch (err) {
          if (err instanceof OhgoAuthError) throw new OhgoRequestRejected(err.message, err.status, err.code);
          throw err;
        }
        rec.run.user = session.name;
        rec.save();
        const client = new OhgoClient(cfg, session.accessToken, traced);
        done =
          req.kind === 'catch'
            ? await pushCatch(cfg, client, post, req.photo!, session, log, rec, traced)
            : await pushTrip(cfg, client, req.trip!, log);
        done = { ...done, cfg, session };
      } catch (err) {
        const message = (err as Error).message;
        rec.finish({ ok: false, error: message });
        log(`등록 실패. 자세한 기록: ${logFile}`);
        (err as Error).message = `${message}\n자세한 기록: ${logFile} (문제가 계속되면 이 파일을 보내 주세요)`;
        throw err;
      }
      rec.finish({ ok: true, rowIds: done.rowIds });
      const { cfg, session } = done;
      const target = req.kind === 'catch' ? 'community_photos' : 'trip_guides';
      const title = req.kind === 'catch' ? req.photo!.title : tripTitle(req.trip!);
      recordLedgerEntry(opts.dir, {
        project: cfg.projectRef,
        bandId: post.source.bandId,
        postId: post.source.postId,
        sourceUrl: post.source.url,
        target,
        rowIds: done.rowIds,
        title,
        registeredAt: new Date().toISOString(),
        by: session.name,
      });
      log(`오고피씽에 등록했습니다 (${req.kind === 'catch' ? '조황 게시판' : `출조 일정 ${done.rowIds.length}건`})`);
      return { kind: req.kind, target, rowIds: done.rowIds, links: done.links, title, resizedImages: done.resized };
    },

    async editImage(postId, file, edit) {
      const outDir = editablePhoto(postId, file);
      if (isNoopEdit(edit)) return revertImage(postId, file);
      const ext = extOf(file);
      const type = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const editor = await (opts.createImageEditor ?? createBrowserImageEditor)();
      let out;
      try {
        out = await editor.apply(readFileSync(join(outDir, file)), type, edit);
      } catch (err) {
        if (err instanceof ImageEditError) throw new OhgoRequestRejected(`${file} 편집 실패: ${err.message}`);
        throw err;
      } finally {
        await editor.close();
      }
      const output = editedFileName(file);
      writeFileSync(join(outDir, output), out.bytes);
      const edits = readEdits(outDir);
      edits[file] = { edit, output, width: out.width, height: out.height, updatedAt: new Date().toISOString() };
      writeEdits(outDir, edits);
      return edits;
    },

    revertImage,

    isAppLink(url) {
      const s = readOhgoSession(opts.dir);
      const base = s?.baseUrl;
      return !!base && (url === base || url.startsWith(`${base}/`));
    },
  };
}
