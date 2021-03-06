var fs = require('fs');
var gm = require('gm');
var s3 = require('s3');
var AWS = require('aws-sdk');
var async = require('async');

// INITIALIZE

require('dotenv').config();
var can_use_aws = true;
if (!process.env.AWS_ACCESS_KEY || !process.env.AWS_SECRET_KEY) {
	console.log('[Warning: missing access keys in .env]');
	can_use_aws = false;
} else if (!process.env.AWS_BUCKET) {
	console.log('[Error: missing bucket in .env]');
	can_use_aws = false;
}

var bucket, s3c, client;
if (can_use_aws) {
	bucket = process.env.AWS_BUCKET;
	AWS.config.update({
		//logger: process.stdout,
		accessKeyId: process.env.AWS_ACCESS_KEY,
		secretAccessKey: process.env.AWS_SECRET_KEY
	});

	s3c = new AWS.S3();
	client = s3.createClient({
	  s3Client: s3c
	});
}

// JPEG DEFINITION

var JPEG = function(filename){
	var self = this;

	// Set up queue
	this.q = async.queue(function(task, callback) {
    callback();
	}, 1);
	this.q.drain = function() {
		process.stdout.write('▓ ' + self.stream.length + ' \n')
	}

	this.stream = null;

	// config
	this.local = true; // TODO: default will later be false? maybe?
	this.quality = 40;
	this.filename = filename;

	if (!filename) {
		throw '[Error: new JPEG(filename) missing required param: filename]'
	}
}

// config a jpeg
JPEG.prototype.config = function(config) {
	for(var prop in config) {
    if (config.hasOwnProperty(prop) && this.hasOwnProperty(prop)) {
      this[prop] = config[prop];
    }
	}
	return this
}

// crust a jpeg
JPEG.prototype.crust = function(quantity,quality) {
	var quantity = quantity ? quantity : 1;
	var quality = quality ? quality : this.quality;
	for (var i=0;i<quantity;i++) {
		var self = this;
		var n = i;
		this.q.push({name: 'crust'},function(err) {
			self.q.pause();
			// Process image
			gm(self.stream, self.filename)
			// just a slight touch
			.sharpen(1,0.5)
			// we don't really get any solid data loss unless we slowly decrease the quality
			.quality((quality - (quality / quantity / 2 * n)))
			.toBuffer('JPEG',function(err,output) {
			  if (err) throw err;
				// Save stream output
				if (output) {
					self.stream = output;
					self.q.resume();
					process.stdout.write('▒');
				} else {
					throw '[Error: no output from gm.toBuffer]'
				}
			});
		});
	}
	return this
}

// fry a jpeg
JPEG.prototype.fry = function(quantity,amount) {
	var self = this;
	var quantity = quantity ? quantity : 1;
	for (var i=0;i<quantity;i++) {
		this.q.push({name: 'fry'},function(err) {
			self.q.pause();
			// Process image
			gm(self.stream, self.filename)
			.sharpen(1,100)
			.toBuffer('JPEG',function(err,output) {
			  if (err) throw err;
				// Save stream output
				if (output) {
					self.stream = output;
					self.q.resume();
					process.stdout.write('▒');
				} else {
					throw '[Error: no output from gm.toBuffer]'
				}
			});
		});
	}
	return this
}

JPEG.prototype.load = function() {
	if (this.filename) {
		var self = this;
		this.q.push({name: 'load'},function(err) {
			if (!self.local && can_use_aws) { // aws
				self.stream = client.downloadStream({Bucket: bucket, Key: self.filename});
			} else { // local
				self.stream = fs.createReadStream(self.filename);
			}
		});
		return this
	} else {
		throw '[Error: JPEG.load: this.filename is undefined]'
	}
}

JPEG.prototype.save = function(filename) {
	if (filename) {
		var self = this;
		this.q.push({name: 'save'},function(err) {
			if (self.stream) {
				self.q.pause()
				if (!self.local && can_use_aws) { // aws
					s3c.putObject({
				    Bucket: bucket,
				    Key: filename,
				    Body: self.stream
				  },function(err,data){
						if (err) throw err;
				    self.q.resume()
				  });
				} else { // local
					var filestream = fs.createWriteStream(filename);
					filestream.write(self.stream);
					filestream.end();
					filestream.on('finish',function(){
						self.q.resume()
					});
				}

			} else {
				throw '[Error: JPEG.stream is null]'
				}
		});
		return this
	} else {
		throw '[Error: JPEG.save(file) missing required param: file]'
	}
}

// EXPORT

module.exports = JPEG;
