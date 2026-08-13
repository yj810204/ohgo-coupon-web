import { redirect } from 'next/navigation';

/** 하위 호환: /samples/game → match3 스샷 */
export default function SampleGameIndexPage() {
  redirect('/samples/game/match3');
}
