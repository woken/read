var fs = require('fs');
var watchr = require('watchr');
var uglify = require('uglify-js');
var browserify = require('browserify');
var coffee = require('./coffee');

function browserify_express(opts) {
	var bundle, cache_time;
	var cache = '';
	
	if (typeof opts !== 'object') throw new Error('opts must be an object');
	if ( ! opts.entry) throw new Error('must provide an entry point');
	if ( ! opts.mount) throw new Error('must provide a mount point');

	opts.bundle_opts = opts.bundle_opts || {};
  opts.watch_opts = opts.watch_opts || {};
  
	bundle = browserify(opts.entry);

	// optional list of files to ignore
	if (Array.isArray(opts.ignore)) {
		opts.ignore.forEach(function(i) {
			bundle.ignore(i);
		});
	}

	bundle.transform( coffee(opts.coffee_source_map) );

	function bundle_it() {
		var stime = new Date();
		bundle.bundle(opts.bundle_opts, function(err, src) {
			cache_time = new Date();
			cache = src;

			if (opts.minify) cache = uglify.minify(cache, {fromString: true}).code;
			
			if (opts.write_file) {
				fs.writeFile(opts.write_file, cache, function (err) {
					if (err) {
						console.log('browserify -- could not write file', opts.write_file);
						throw err;
					}
					else {
						if (opts.verbose) console.log('browserify -- writing file', opts.write_file);
					}
				});
			}
			
			if (opts.verbose) {
				var bundle_seconds = Number(((new Date()) - stime) / 1000);
				console.log('browserify -- bundled [' + bundle_seconds.toFixed(2) + 's] ' + opts.mount);
			}
		});
	}

	bundle_it();

	if (opts.watch) {
		// watchr seems more reliable than node-watch...
		watchr.watch({
			paths: [opts.watch],
			listeners: {
				error: function(err) {
					console.log('browserify --', err);
				},
				watching: function(err, instance, watching) {
					if (err) console.log('browserify -- failed to watch', instance.path);
					else console.log('browserify -- watching', instance.path);
				},
				change: function(type, path, curstat, oldstat) {
					console.log('browserify -- file changed', path);
					bundle_it();
				}
			},
			next: function(err, watchers) {
				if (err) { return console.log('browserify -- failed', err); }
			}
		});
	}
	
	return function(req, res, next) {
		if (req.url.split('?')[0] === opts.mount) {
			res.statusCode = 200;
			res.setHeader('last-modified', cache_time.toString());
			res.setHeader('content-type', 'text/javascript');
			res.end(cache);
		}
		else {
			next();
		}
	};
}

module.exports = browserify_express;

