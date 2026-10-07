import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Classification, OhgoKind, PhotoDraft } from './classify.mts';
import { buildPhotoDraft, classifyPost, validatePhotoDraft } from './classify.mts';
import { createBrowserReencoder, prepareImage } from './image-prep.mts';
import type { Reencode } from './image-prep.mts';
import type { LedgerEntry } from './ledger.mts';
import { findLedgerEntry, recordLedgerEntry } from './ledger.mts';
import type { OhgoCredentials } from './ohgo-auth.mts';
import { clearOhgoSession, ensureFreshSession, loginOhgo, OhgoAuthError, readOhgoSession, saveOhgoSession } from './ohgo-auth.mts';
import { newPhotoObjectPath, OhgoClient } from './ohgo-client.mts';
import { resolvePostImages } from './post-images.mts';
import type { Fetch, OhgoConfig } from './ohgo-config.mts';
import { projectRefFromUrl, resolveOhgoConfig } from './ohgo-config.mts';
import type { ExtractedPost } from './schema.mts';
import { validateExtracted } from './schema.mts';
import type { TripDraft } from './trip-parse.mts';
import { parseTripGuide, postRefDate, validateTripDraft } from './trip-parse.mts';

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
  classification: Classification;
  photo: PhotoDraft;
  /** extracted.json과 폴더의 사진이 어긋날 때 알림 */
  photoWarnings: string[];
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
  isAppLink(url: string): boolean;
};

export type OhgoServiceOptions = {
  /** 세션과 장부를 두는 폴더 */
  dir: string;
  outRoot: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: Fetch;
  createReencoder?: () => Promise<{ reencode: Reencode; close: () => Promise<void> }>;
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

function tripTitle(draft: TripDraft): string {
  const dates = [...new Set(draft.rows.map((r) => r.date))].sort();
  const span = dates.length > 1 ? `${dates[0]} ~ ${dates[dates.length - 1]}` : dates[0] ?? '';
  return `${span} ${draft.destination.trim()} ${draft.rows.length}건`;
}

function eqParam(value: string): string {
  return `eq.${encodeURIComponent(value)}`;
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

  const pushCatch = async (cfg: OhgoConfig, client: OhgoClient, post: ExtractedPost, draft: PhotoDraft, session: { userId: string; name: string }, log: Log) => {
    const outDir = join(opts.outRoot, post.source.postId);
    const uploaded: string[] = [];
    const urls: string[] = [];
    let resized = 0;
    const encoder = await (opts.createReencoder ?? createBrowserReencoder)();
    try {
      for (const [i, file] of draft.images.entries()) {
        const prepared = await prepareImage(readFileSync(join(outDir, file)), file, encoder.reencode);
        if (prepared.resized) {
          resized++;
          log(`사진 ${file}: ${(prepared.originalBytes / 1048576).toFixed(1)}MB → ${(prepared.bytes.length / 1048576).toFixed(1)}MB로 줄였습니다`);
        }
        const path = newPhotoObjectPath(prepared.ext);
        log(`사진 올리는 중 ${i + 1}/${draft.images.length}`);
        urls.push(await client.uploadPhoto(path, prepared.bytes, prepared.contentType));
        uploaded.push(path);
        if (opts.uploadGapMs) await new Promise((r) => setTimeout(r, opts.uploadGapMs));
      }
      const row: Record<string, unknown> = {
        uploaded_by: session.userId,
        uploaded_by_name: session.name,
        title: draft.title.trim(),
        description: draft.description,
        image_urls: urls,
        comment_count: 0,
        board_type: 'photo',
      };
      if (draft.photoDate) row.photo_date = draft.photoDate;
      log('조황 게시판에 글을 저장하는 중');
      const id = await client.insert('community_photos', row, ['uploaded_by_name', 'photo_date', 'board_type']);
      return { rowIds: [id], links: [`${cfg.baseUrl}/community/${id}`], resized };
    } catch (err) {
      if (uploaded.length) {
        log('저장에 실패해 올린 사진을 지웁니다');
        await client.removePhotos(uploaded).catch((e: Error) => log(`올린 사진 정리 실패: ${e.message}`));
      }
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
      const images = resolvePostImages(join(opts.outRoot, post.source.postId), post);
      const classification = classifyPost(post, images.files.length);
      const photo = buildPhotoDraft(post, images.files);
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
        classification,
        photo,
        photoWarnings: images.warnings,
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

    async push(req, log) {
      checkPush(req);
      const post = loadExtracted(opts.outRoot, req.postId);
      const cfg = await config();
      let session;
      try {
        session = await ensureFreshSession(cfg, opts.dir, fetchImpl);
      } catch (err) {
        if (err instanceof OhgoAuthError) throw new OhgoRequestRejected(err.message, 401);
        throw err;
      }
      const client = new OhgoClient(cfg, session.accessToken, fetchImpl);
      const done =
        req.kind === 'catch'
          ? await pushCatch(cfg, client, post, req.photo!, session, log)
          : await pushTrip(cfg, client, req.trip!, log);
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

    isAppLink(url) {
      const s = readOhgoSession(opts.dir);
      const base = s?.baseUrl;
      return !!base && (url === base || url.startsWith(`${base}/`));
    },
  };
}
