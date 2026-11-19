/* Shared project identity: the browser and demonstration seed use the same profiles. */
(function (root, factory) {
  const project = factory();
  if (typeof module === "object" && module.exports) module.exports = project;
  else root.CEUBProject = project;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  return Object.freeze({
    name: "CEUB Music",
    group: "Centauros",
    campus: "Taguatinga",
    authors: Object.freeze([
      Object.freeze({ id: "1", name: "Arthur Araujo" }),
      Object.freeze({ id: "2", name: "Guilherme Leony" }),
      Object.freeze({ id: "3", name: "Luan Jywago" }),
    ]),
  });
});
