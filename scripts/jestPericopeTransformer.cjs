'use strict';

/**
 * Jest stand-in for the `.pericope` Metro assets. The files are unmodified
 * JSON; on device Metro returns an asset id instead of evaluating them.
 */
module.exports = {
  process(sourceText) {
    return { code: `module.exports = ${sourceText};` };
  },
};
