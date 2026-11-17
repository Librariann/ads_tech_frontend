export default function WorkspaceSettingsLoading() {
  return (
    <div aria-label="설정 불러오는 중" aria-busy="true" className="min-h-screen bg-[#f8f9fa] lg:flex">
      <aside className="hidden w-[248px] shrink-0 border-r border-[#e2e5e7] bg-white lg:block" />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1040px] px-5 py-8 motion-safe:animate-pulse sm:px-8 sm:py-11 lg:px-12 lg:py-13">
          <div className="h-4 w-28 rounded bg-[#e2e5e7]" />
          <div className="mt-7 h-7 w-56 rounded bg-[#e2e5e7]" />
          <div className="mt-4 h-4 w-64 max-w-full rounded bg-[#e2e5e7]" />
          <div className="mt-8 h-14 border-b border-[#e2e5e7]" />
          <div className="mt-8">
            <div className="h-5 w-24 rounded bg-[#e2e5e7]" />
            <div className="mt-7 space-y-6">
              <div className="h-16 rounded-md bg-[#eef0f2]" />
              <div className="h-16 rounded-md bg-[#eef0f2]" />
              <div className="h-16 rounded-md bg-[#eef0f2]" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
