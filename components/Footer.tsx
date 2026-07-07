/** Footer with the mandatory non-affiliation disclaimer. */
export default function Footer() {
  return (
    <footer className="hairline border-t">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-1 px-4 py-5 text-center sm:px-6">
        <p className="text-xs text-sand">
          Unofficial demo and portfolio project. Not affiliated with FIVE
          Hotels and Resorts.
        </p>
        <p className="text-[0.65rem] text-sand/60">
          Content sourced from{" "}
          <a
            href="https://www.fivehotelsandresorts.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-gold/40 underline-offset-2 transition-colors hover:text-gold"
          >
            fivehotelsandresorts.com
          </a>
          . Always confirm details with the hotel.
        </p>
      </div>
    </footer>
  );
}
