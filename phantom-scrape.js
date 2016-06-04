var system = require("system");
var page = require("webpage").create();
var url = system.args[1];
var readabilityPath = system.args[2];
var userAgent = system.args[3];
var consoleLogs = [];

// Prevent page js errors to break JSON output
// XXX: should we log these instead?
phantom.onError = page.onError = function(){};

function exitWithError(message) {
  outputJSON({error: {message: message}});
  phantom.exit();
}

function outputJSON(object) {
  console.log(JSON.stringify(object, null, 2));
}

/**
 * Note: This function runs within page environment.
 */
function runReadability(url, userAgent, pageContent) {
  var location = document.location;
  var getLanguage = function(document) {
    var lang = document.documentElement.lang;
    if (lang !== undefined) {
      return lang;
    }
    var metas = document.getElementsByTagName('meta');
    for (var i=0; i<metas.length; i++) {
      if (metas[i].getAttribute("name") === "language") {
        return metas[i].getAttribute("content");
      }
    }
    return "";
  };

  var getDirection = function(document) {
    var bodyTags = document.getElementsByTagName('body');
    if (bodyTags.length === 0) {
      return "";
    }
    if (window.getComputedStyle) {
      return window.getComputedStyle(bodyTags[0], null).getPropertyValue('direction');
    }
    return "";
  };

  var uri = {
    spec: location.href,
    host: location.host,
    prePath: location.protocol + "//" + location.host, // TODO This is incomplete, needs username/password and port
    scheme: location.protocol.substr(0, location.protocol.indexOf(":")),
    pathBase: location.protocol + "//" + location.host + location.pathname.substr(0, location.pathname.lastIndexOf("/") + 1)
  };
  try {
    var readabilityObj = new Readability(uri, document);
    var isProbablyReaderable = readabilityObj.isProbablyReaderable();
    var result = readabilityObj.parse();
    if (result) {
      result.userAgent = userAgent;
      result.isProbablyReaderable = isProbablyReaderable;
      result.language = getLanguage(document);
      if (result.dir === undefined || result === '') {
        result.dir = getDirection(document);
      }
    } else {
      result = {
        error: {
          message: "Empty result from Readability.js.",
          sourceHTML: pageContent || "Empty page content."
        }
      };
    }
    return result;
  } catch (err) {
    return {
      error: {
        message: err.message,
        line: err.line,
        stack: err.stack,
        sourceHTML: pageContent || "Empty page content."
      }
    };
  }
};

if (!url) {
  exitWithError("Missing url arg.");
} else if (!readabilityPath) {
  exitWithError("Missing readabilityPath arg.");
}

if (userAgent) {
  page.settings.userAgent = userAgent;
}

// disable loading images as we don't use them
page.settings.loadImages = false;

// ensure we don't waste time trying to load slow/missing resources
page.settings.resourceTimeout = 1000;

page.onConsoleMessage = function(msg) {
  consoleLogs.push(msg);
};

page.open(url, function(status) {
  if (status !== "success") {
    return exitWithError("Unable to access " + url);
  }
  if (!page.injectJs(readabilityPath)) {
    exitWithError("Couldn't inject " + readabilityPath);
  }
  var result = page.evaluate(runReadability, url, page.settings.userAgent, page.content);
  if (result && result.error) {
    result.error.consoleLogs = consoleLogs;
  } else if (result && result.content) {
    result.consoleLogs = consoleLogs;
  }
  outputJSON(result);
  phantom.exit();
});
