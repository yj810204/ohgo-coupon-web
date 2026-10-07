export type CatchShareInput = {
  title: string;
  text: string;
  imageUrl: string;
};

type KakaoSdk = {
  init: (key: string) => void;
  isInitialized: () => boolean;
  Share: {
    sendDefault: (settings: Record<string, unknown>) => void;
  };
};

function shareBody(input: CatchShareInput): string {
  return `${input.text}\n${input.imageUrl}`;
}

function smsHref(body: string): string {
  const encoded = encodeURIComponent(body);
  const apple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
  return apple ? `sms:&body=${encoded}` : `sms:?body=${encoded}`;
}

let kakaoLoader: Promise<KakaoSdk | null> | null = null;

function loadKakaoSdk(): Promise<KakaoSdk | null> {
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY?.trim();
  if (!key || typeof window === 'undefined') return Promise.resolve(null);
  kakaoLoader ??= new Promise((resolve) => {
    const existing = (window as Window & { Kakao?: KakaoSdk }).Kakao;
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.2/kakao.min.js';
    script.async = true;
    script.onload = () => resolve((window as Window & { Kakao?: KakaoSdk }).Kakao ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return kakaoLoader;
}

/** 카카오톡 친구 선택 화면. 키가 없으면 설치된 카카오톡으로 링크를 연다. */
export async function shareCatchToKakao(input: CatchShareInput): Promise<void> {
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY?.trim();
  const sdk = key ? await loadKakaoSdk() : null;
  if (sdk && key) {
    if (!sdk.isInitialized()) sdk.init(key);
    sdk.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: input.title,
        description: input.text,
        imageUrl: input.imageUrl,
        link: {
          mobileWebUrl: input.imageUrl,
          webUrl: input.imageUrl,
        },
      },
      buttons: [
        {
          title: '사진 보기',
          link: {
            mobileWebUrl: input.imageUrl,
            webUrl: input.imageUrl,
          },
        },
      ],
    });
    return;
  }
  window.location.href = `kakaotalk://sendurl?url=${encodeURIComponent(input.imageUrl)}&text=${encodeURIComponent(input.text)}`;
}

export function shareCatchBySms(input: CatchShareInput): void {
  window.location.href = smsHref(shareBody(input));
}

export function shareCatchByEmail(input: CatchShareInput): void {
  const href = `mailto:?subject=${encodeURIComponent(input.title)}&body=${encodeURIComponent(shareBody(input))}`;
  window.location.href = href;
}
