var EventEmitter = require('events').EventEmitter,
    _ = require('underscore'),
    config = null,
    cachedTemplate = {};

exports.generatePage = function generatePage(templateName, data) {
  var e = new EventEmitter();
  var cached = cachedTemplate[templateName];

  // Lazy initialize.
  if (!config) {
    config = require('./config.js').getCachedConfig();
  }

  if (cached) {
    setTimeout(e.emit.bind(e, 'ok', cached(data)), 0);
  } else {
    fs.readFile(config.templateDir + "/" + templateName, 'utf8', function(err, d) {
      if (err) {
        e.emit('error', err);
        return;
      }
      cached = _.template(d);
      cachedTemplate[templateName] = cached;
      e.emit('ok', cached(data));
    });
  }
  return e;
}

