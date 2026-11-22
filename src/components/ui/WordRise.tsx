import { Fragment, type CSSProperties } from "react";

/**
 * A heading's words, each in its own span, so they can rise into place one
 * after another as the heading scrolls into view (`.wr` and `.wr-w` in
 * globals.css). The words keep the spaces between them as plain text, so the
 * heading's text, its accessible name and the way it wraps are unchanged.
 *
 * Put `wr` on the heading itself: the animation is tied to the heading's own
 * entry into the viewport, so it has always finished by the time the heading
 * is fully on screen, and under reduced motion (or in a browser without
 * scroll timelines) the words simply sit still.
 *
 * Idea from Ruixen UI's Scroll Text Rise; written here from scratch.
 */
export function WordRise({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((word, index) => (
        <Fragment key={index}>
          {index > 0 ? " " : null}
          <span className="wr-w" style={{ "--i": index } as CSSProperties}>
            {word}
          </span>
        </Fragment>
      ))}
    </>
  );
}
