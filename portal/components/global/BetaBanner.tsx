/** A large "This is in Beta" banner across the top of a page still being built. */
export const BetaBanner = ({ feature }: { feature: string }) => (
  <div
    role="note"
    className="flex shrink-0 items-center justify-center gap-3 border-b border-amber-400/40 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 px-4 py-3 text-center text-white shadow-sm"
  >
    <span className="material-symbols-outlined text-[28px] leading-none">
      science
    </span>
    <div className="flex flex-col items-center gap-0.5 sm:flex-row sm:gap-3">
      <span className="text-lg font-extrabold uppercase tracking-wide sm:text-xl">
        This is in Beta
      </span>
      <span className="text-sm font-medium text-white/90">
        {feature} are still being built, so things may change or not work
        perfectly yet.
      </span>
    </div>
  </div>
);
