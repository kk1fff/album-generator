var EventEmitter = require('events').EventEmitter,
    _ = require('underscore'),
    config = null,
    cachedTemplate = {},
    cachedPageParts = {};

function getPageProperties() {
  return {
    site: {
      title: "Patrick's Album"
    }
  }
}

// Load template part from file.
function getPageParts(name) {
  var e = new EventEmitter(),
      cached = cachedPageParts[name];

  if (cached) {
    setTimeout(e.emit.bind(e, 'ok', cached), 0);
  } else {
    fs.readFile(config.pagePartDir + "/" + name, 'utf8', function(err, d) {
      if (err) {
        e.emit('error', err);
        return;
      }
      cachedPageParts[name] = d;
      e.emit('ok', d);
    });
  }

  return e;
}

function formFullTemplate(bodyTempleate) {
  var e = new EventEmitter(),
      header,
      footer,
      loadingHeader = getPageParts('header.html'),
      loadingFooter = getPageParts('footer.html');

  function tryFinish() {
    if (header && footer) {
      e.emit('ok', header + bodyTempleate + footer);
    }
  }

  loadingHeader.on('ok', function(data) {
    header = data;
    tryFinish();
  });
  loadingHeader.on('error', function(err) {
    e.emit('error', err);
  });

  loadingFooter.on('ok', function(data) {
    footer = data;
    tryFinish();
  });
  loadingFooter.on('error', function(err) {
    e.emit('error', err);
  });

  return e;
}

exports.generatePage = function generatePage(templateName, data) {
  var e = new EventEmitter(),
      cached = cachedTemplate[templateName],
      renderData;

  // Lazy initialize.
  if (!config) {
    config = require('./config.js').getCachedConfig();
  }

  renderData = _.extend(data, getPageProperties());
  if (cached) {
    setTimeout(e.emit.bind(e, 'ok', cached(renderData)), 0);
  } else {
    fs.readFile(config.templateDir + "/" + templateName, 'utf8', function(err, d) {
      if (err) {
        e.emit('error', err);
        return;
      }
      
      var ee = formFullTemplate(d);
      ee.on('ok', function(templ) {
        cached = _.template(templ);
        cachedTemplate[templateName] = cached;
        e.emit('ok', cached(renderData));
      });
      ee.on('error', function(err) {
        e.emit('error', err);
      });
    });
  }
  return e;
}

