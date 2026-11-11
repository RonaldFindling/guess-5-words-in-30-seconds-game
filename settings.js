// Settings for 30 Seconds. Edit and reload the page.
//   guessSeconds   – length of the guessing round (5–300)
//   previewSeconds – time the describer sees the words before the clock starts (0–120, 0 = no preview)
//   packs          – word packs to offer. Each name must match a file in the words/ folder:
//                    "star-wars" loads words/star-wars.js. Names may use letters, digits, - and _.
// Times changed in the in-app settings panel override these for this browser only;
// use "Reset to file defaults" there to go back to these values.
window.SETTINGS = {
  "guessSeconds": 30,
  "previewSeconds": 5,
  "packs": ["general", "star-wars", "movies"]
};
