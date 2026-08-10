export default function WorkspaceSettingsLoading() {
  return (
    <div className="min-h-screen bg-[#faf8f5] lg:flex">
      <aside className="hidden w-[248px] border-r border-[#e9e2da] bg-[#fdfbf8] lg:block" />
      <main className="flex-1 px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
        <div className="mx-auto max-w-[960px] animate-pulse">
          <div className="h-4 w-28 rounded bg-[#e9e2da]" />
          <div className="mt-7 h-9 w-64 rounded bg-[#ded7cf]" />
          <div className="mt-4 h-4 w-80 max-w-full rounded bg-[#e9e2da]" />
          <div className="mt-12 border-t border-[#e2dbd3] pt-8">
            <div className="h-6 w-36 rounded bg-[#ded7cf]" />
            <div className="mt-8 space-y-7">
              <div className="h-12 rounded-lg bg-[#ebe5de]" />
              <div className="h-12 rounded-lg bg-[#ebe5de]" />
              <div className="h-12 rounded-lg bg-[#ebe5de]" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
