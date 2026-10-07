type RouteSkeletonProps = {
  variant?: 'home' | 'list' | 'cards';
};

function Bone({ height, width = '100%', radius = 12 }: { height: number; width?: string | number; radius?: number }) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius: radius,
        backgroundColor: '#E8EAED',
      }}
    />
  );
}

/** 라우트 전환 중 본문 자리. 글자는 넣지 않는다. */
export default function RouteSkeleton({ variant = 'list' }: RouteSkeletonProps) {
  return (
    <div className="min-vh-100" style={{ backgroundColor: '#F7F8FA' }} aria-busy="true">
      <span className="visually-hidden">불러오는 중</span>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px 32px' }}>
        <Bone height={28} width="42%" radius={8} />
        <div style={{ height: 16 }} />
        {variant === 'home' ? (
          <>
            <Bone height={120} />
            <div style={{ height: 16 }} />
            <div className="d-flex gap-3">
              <Bone height={140} />
              <Bone height={140} />
            </div>
            <div style={{ height: 16 }} />
            <Bone height={88} />
            <div style={{ height: 12 }} />
            <Bone height={88} />
          </>
        ) : variant === 'cards' ? (
          <div className="row g-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="col-6">
                <Bone height={180} />
              </div>
            ))}
          </div>
        ) : (
          <>
            <Bone height={72} />
            <div style={{ height: 10 }} />
            <Bone height={72} />
            <div style={{ height: 10 }} />
            <Bone height={72} />
            <div style={{ height: 10 }} />
            <Bone height={72} />
          </>
        )}
      </div>
    </div>
  );
}
