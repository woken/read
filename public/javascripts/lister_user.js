(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* global OfflineAudioContext */
'use strict';

var utils = require('./utils');
/**
 * Captures microphone input from the browser.
 * Works at least on latest versions of Firefox and Chrome
 */
function Microphone(_options) {
  var options = _options || {};

  // we record in mono because the speech recognition service
  // does not support stereo.
  this.bufferSize = options.bufferSize || 8192;
  this.inputChannels = options.inputChannels || 1;
  this.outputChannels = options.outputChannels || 1;
  this.recording = false;
  this.requestedAccess = false;
  this.sampleRate = 16000;
  // auxiliar buffer to keep unused samples (used when doing downsampling)
  this.bufferUnusedSamples = new Float32Array(0);
  this.samplesAll = new Float32Array(20000000);
  this.samplesAllOffset = 0;

  // Chrome or Firefox or IE User media
  if (!navigator.getUserMedia) {
    navigator.getUserMedia = navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia || navigator.msGetUserMedia;
  }

}

/**
 * Called when the user reject the use of the michrophone
 * @param  error The error
 */
Microphone.prototype.onPermissionRejected = function() {
  console.log('Microphone.onPermissionRejected()');
  this.requestedAccess = false;
  this.onError('Permission to access the microphone rejeted.');
};

Microphone.prototype.onError = function(error) {
  console.log('Microphone.onError():', error);
};

/**
 * Called when the user authorizes the use of the microphone.
 * @param  {Object} stream The Stream to connect to
 *
 */
Microphone.prototype.onMediaStream = function(stream) {
  var AudioCtx = window.AudioContext || window.webkitAudioContext;

  if (!AudioCtx)
    throw new Error('AudioContext not available');

  if (!this.audioContext)
    this.audioContext = new AudioCtx();

  var gain = this.audioContext.createGain();
  var audioInput = this.audioContext.createMediaStreamSource(stream);

  audioInput.connect(gain);

  if (!this.mic) {
    this.mic = this.audioContext.createScriptProcessor(this.bufferSize,
    this.inputChannels, this.outputChannels);
  }

  // uncomment the following line if you want to use your microphone sample rate
  // this.sampleRate = this.audioContext.sampleRate;
  console.log('Microphone.onMediaStream(): sampling rate is:', this.sampleRate);

  this.mic.onaudioprocess = this._onaudioprocess.bind(this);
  this.stream = stream;

  gain.connect(this.mic);
  this.mic.connect(this.audioContext.destination);
  this.recording = true;
  this.requestedAccess = false;
  this.onStartRecording();
};

/**
 * callback that is being used by the microphone
 * to send audio chunks.
 * @param  {object} data audio
 */
Microphone.prototype._onaudioprocess = function(data) {
  if (!this.recording) {
    // We speak but we are not recording
    return;
  }

  // Single channel
  var chan = data.inputBuffer.getChannelData(0);

  // resampler(this.audioContext.sampleRate,data.inputBuffer,this.onAudio);

  this.saveData(new Float32Array(chan));
  this.onAudio(this._exportDataBufferTo16Khz(new Float32Array(chan)));

  // export with microphone mhz, remember to update the this.sampleRate
  // with the sample rate from your microphone
  // this.onAudio(this._exportDataBuffer(new Float32Array(chan)));

};

/**
 * Start the audio recording
 */
Microphone.prototype.record = function() {
  if (!navigator.getUserMedia){
    this.onError('Browser doesn\'t support microphone input');
    return;
  }
  if (this.requestedAccess) {
    return;
  }

  this.requestedAccess = true;
  navigator.getUserMedia({audio: true},
    this.onMediaStream.bind(this), // Microphone permission granted
    this.onPermissionRejected.bind(this)); // Microphone permission rejected
};

/**
 * Stop the audio recording
 */
Microphone.prototype.stop = function() {
  if (!this.recording)
    return;
  if (JSON.parse(localStorage.getItem('playback')))
    this.playWav(); /* plays back the audio that was recorded*/
  this.recording = false;
  this.stream.getTracks()[0].stop();
  this.requestedAccess = false;
  this.mic.disconnect(0);
  this.onStopRecording();
};

/**
 * Creates a Blob type: 'audio/l16' with the chunk and downsampling to 16 kHz
 * coming from the microphone.
 * Explanation for the math: The raw values captured from the Web Audio API are
 * in 32-bit Floating Point, between -1 and 1 (per the specification).
 * The values for 16-bit PCM range between -32768 and +32767 (16-bit signed integer).
 * Multiply to control the volume of the output. We store in little endian.
 * @param  {Object} buffer Microphone audio chunk
 * @return {Blob} 'audio/l16' chunk
 * @deprecated This method is depracated
 */
Microphone.prototype._exportDataBufferTo16Khz = function(bufferNewSamples) {
  var buffer = null,
    newSamples = bufferNewSamples.length,
    unusedSamples = this.bufferUnusedSamples.length;


  if (unusedSamples > 0) {
    buffer = new Float32Array(unusedSamples + newSamples);
    for (var i = 0; i < unusedSamples; ++i) {
      buffer[i] = this.bufferUnusedSamples[i];
    }
    for (i = 0; i < newSamples; ++i) {
      buffer[unusedSamples + i] = bufferNewSamples[i];
    }
  } else {
    buffer = bufferNewSamples;
  }

  // downsampling variables
  var filter = [
      -0.037935, -0.00089024, 0.040173, 0.019989, 0.0047792, -0.058675, -0.056487,
      -0.0040653, 0.14527, 0.26927, 0.33913, 0.26927, 0.14527, -0.0040653, -0.056487,
      -0.058675, 0.0047792, 0.019989, 0.040173, -0.00089024, -0.037935
    ],
    samplingRateRatio = this.audioContext.sampleRate / 16000,
    nOutputSamples = Math.floor((buffer.length - filter.length) / (samplingRateRatio)) + 1,
    pcmEncodedBuffer16k = new ArrayBuffer(nOutputSamples * 2),
    dataView16k = new DataView(pcmEncodedBuffer16k),
    index = 0,
    volume = 0x7FFF, // range from 0 to 0x7FFF to control the volume
    nOut = 0;

  // eslint-disable-next-line no-redeclare
  for (var i = 0; i + filter.length - 1 < buffer.length; i = Math.round(samplingRateRatio * nOut)) {
    var sample = 0;
    for (var j = 0; j < filter.length; ++j) {
      sample += buffer[i + j] * filter[j];
    }
    sample *= volume;
    dataView16k.setInt16(index, sample, true); // 'true' -> means little endian
    index += 2;
    nOut++;
  }

  var indexSampleAfterLastUsed = Math.round(samplingRateRatio * nOut);
  var remaining = buffer.length - indexSampleAfterLastUsed;
  if (remaining > 0) {
    this.bufferUnusedSamples = new Float32Array(remaining);
    for (i = 0; i < remaining; ++i) {
      this.bufferUnusedSamples[i] = buffer[indexSampleAfterLastUsed + i];
    }
  } else {
    this.bufferUnusedSamples = new Float32Array(0);
  }

  return new Blob([dataView16k], {
    type: 'audio/l16'
  });
};



// // native way of resampling captured audio
// var resampler = function(sampleRate, audioBuffer, callbackProcessAudio) {
//
//   console.log('length: ' + audioBuffer.length + ' ' + sampleRate);
//   var channels = 1;
//   var targetSampleRate = 16000;
//   var numSamplesTarget = audioBuffer.length * targetSampleRate / sampleRate;
//
//   var offlineContext = new OfflineAudioContext(channels, numSamplesTarget, targetSampleRate);
//   var bufferSource = offlineContext.createBufferSource();
//   bufferSource.buffer = audioBuffer;
//
//   // callback that is called when the resampling finishes
//   offlineContext.oncomplete = function(event) {
//     var samplesTarget = event.renderedBuffer.getChannelData(0);
//     console.log('Done resampling: ' + samplesTarget.length + ' samples produced');
//
//   // convert from [-1,1] range of floating point numbers to [-32767,32767] range of integers
//     var index = 0;
//     var volume = 0x7FFF;
//     var pcmEncodedBuffer = new ArrayBuffer(samplesTarget.length * 2);    // short integer to byte
//     var dataView = new DataView(pcmEncodedBuffer);
//     for (var i = 0; i < samplesTarget.length; i++) {
//       dataView.setInt16(index, samplesTarget[i] * volume, true);
//       index += 2;
//     }
//
//     // l16 is the MIME type for 16-bit PCM
//     callbackProcessAudio(new Blob([dataView], {type: 'audio/l16'}));
//   };
//
//   bufferSource.connect(offlineContext.destination);
//   bufferSource.start(0);
//   offlineContext.startRendering();
// };



/**
 * Creates a Blob type: 'audio/l16' with the
 * chunk coming from the microphone.
 */
// var exportDataBuffer = function(buffer, bufferSize) {
//   var pcmEncodedBuffer = null,
//     dataView = null,
//     index = 0,
//     volume = 0x7FFF; // range from 0 to 0x7FFF to control the volume
//
//   pcmEncodedBuffer = new ArrayBuffer(bufferSize * 2);
//   dataView = new DataView(pcmEncodedBuffer);
//
//   /* Explanation for the math: The raw values captured from the Web Audio API are
//    * in 32-bit Floating Point, between -1 and 1 (per the specification).
//    * The values for 16-bit PCM range between -32768 and +32767 (16-bit signed integer).
//    * Multiply to control the volume of the output. We store in little endian.
//    */
//   for (var i = 0; i < buffer.length; i++) {
//     dataView.setInt16(index, buffer[i] * volume, true);
//     index += 2;
//   }
//
//   // l16 is the MIME type for 16-bit PCM
//   return new Blob([dataView], {type: 'audio/l16'});
// };

Microphone.prototype._exportDataBuffer = function(buffer){
  utils.exportDataBuffer(buffer, this.bufferSize);
};


// Functions used to control Microphone events listeners.
Microphone.prototype.onStartRecording = function() {};
Microphone.prototype.onStopRecording = function() {};
Microphone.prototype.onAudio = function() {};

module.exports = Microphone;

Microphone.prototype.saveData = function(samples) {
  for (var i = 0; i < samples.length; ++i) {
    this.samplesAll[this.samplesAllOffset + i] = samples[i];
  }
  this.samplesAllOffset += samples.length;
  console.log('samples: ' + this.samplesAllOffset);
};

Microphone.prototype.playWav = function() {
  var samples = this.samplesAll.subarray(0, this.samplesAllOffset);
  var dataview = this.encodeWav(samples, 1, this.audioContext.sampleRate);
  var audioBlob = new Blob([dataview], {type: 'audio/l16'});
  var url = window.URL.createObjectURL(audioBlob);
  var audio = new Audio();
  audio.src = url;
  audio.play();
};

Microphone.prototype.encodeWav = function(samples, numChannels, sampleRate) {
  console.log('#samples: ' + samples.length);
  var buffer = new ArrayBuffer(44 + samples.length * 2);
  var view = new DataView(buffer);

  /* RIFF identifier */
  this.writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  this.writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  this.writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 4, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, numChannels * 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  this.writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  this.floatTo16BitPCM(view, 44, samples);

  return view;
};

Microphone.prototype.writeString = function(view, offset, string){
  for (var i = 0; i < string.length; i++){
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

Microphone.prototype.floatTo16BitPCM = function(output, offset, input){
  for (var i = 0; i < input.length; i++, offset += 2){
    var s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
};

},{"./utils":8}],2:[function(require,module,exports){
module.exports={
   "models": [
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/ar-AR_BroadbandModel", 
         "rate": 16000, 
         "name": "ar-AR_BroadbandModel", 
         "language": "ar-AR", 
         "description": "Modern Standard Arabic broadband model."
      }, 
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/en-UK_BroadbandModel", 
         "rate": 16000, 
         "name": "en-UK_BroadbandModel", 
         "language": "en-UK", 
         "description": "UK English broadband model."
      }, 
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/en-UK_NarrowbandModel", 
         "rate": 8000, 
         "name": "en-UK_NarrowbandModel", 
         "language": "en-UK", 
         "description": "UK English narrowband model."
      },
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/en-US_BroadbandModel", 
         "rate": 16000, 
         "name": "en-US_BroadbandModel", 
         "language": "en-US", 
         "description": "US English broadband model."
      }, 
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/en-US_NarrowbandModel", 
         "rate": 8000, 
         "name": "en-US_NarrowbandModel", 
         "language": "en-US", 
         "description": "US English narrowband model."
      }, 
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/es-ES_BroadbandModel", 
         "rate": 16000, 
         "name": "es-ES_BroadbandModel", 
         "language": "es-ES", 
         "description": "Spanish broadband model."
      }, 
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/es-ES_NarrowbandModel", 
         "rate": 8000, 
         "name": "es-ES_NarrowbandModel", 
         "language": "es-ES", 
         "description": "Spanish narrowband model."
      },
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/fr-FR_BroadbandModel", 
         "rate": 16000, 
         "name": "fr-FR_BroadbandModel", 
         "language": "fr-FR", 
         "description": "French broadband model."
      },
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/ja-JP_BroadbandModel", 
         "rate": 16000, 
         "name": "ja-JP_BroadbandModel", 
         "language": "ja-JP", 
         "description": "Japanese broadband model."
      }, 
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/ja-JP_NarrowbandModel", 
         "rate": 8000, 
         "name": "ja-JP_NarrowbandModel", 
         "language": "ja-JP", 
         "description": "Japanese narrowband model."
      }, 
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/pt-BR_BroadbandModel", 
         "rate": 16000, 
         "name": "pt-BR_BroadbandModel", 
         "language": "pt-BR", 
         "description": "Brazilian Portuguese broadband model."
      }, 
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/pt-BR_NarrowbandModel", 
         "rate": 8000, 
         "name": "pt-BR_NarrowbandModel", 
         "language": "pt-BR", 
         "description": "Brazilian Portuguese narrowband model."
      }, 
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/zh-CN_BroadbandModel", 
         "rate": 16000, 
         "name": "zh-CN_BroadbandModel", 
         "language": "zh-CN", 
         "description": "Mandarin broadband model."
      },
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/zh-CN_NarrowbandModel", 
         "rate": 8000, 
         "name": "zh-CN_NarrowbandModel", 
         "language": "zh-CN", 
         "description": "Mandarin narrowband model."
      } 
   ]
}
},{}],3:[function(require,module,exports){
/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* global $ */
'use strict';

var display = require('./views/displaymetadata');
var initSocket = require('./socket').initSocket;

exports.handleFileUpload = function(type, token, model, file, contentType, callback, onend) {
  // Set currentlyDisplaying to prevent other sockets from opening
  localStorage.setItem('currentlyDisplaying', type);

  $.subscribe('progress', function(evt, data) {
    console.log('progress: ', data);
  });

  console.log('contentType', contentType);

  var baseString = '';
  var baseJSON = '';

  $.subscribe('showjson', function() {
    var $resultsJSON = $('#resultsJSON');
    $resultsJSON.val(baseJSON);
  });

  var keywords = display.getKeywordsToSearch();
  var keywords_threshold = keywords.length == 0 ? null : 0.01;

  var options = {};
  options.token = token;
  options.message = {
    'action': 'start',
    'content-type': contentType,
    'interim_results': true,
    'continuous': true,
    'word_confidence': true,
    'timestamps': true,
    'max_alternatives': 3,
    'inactivity_timeout': 600,
    'word_alternatives_threshold': 0.001,
    'keywords_threshold': keywords_threshold,
    'keywords': keywords,
    'smart_formatting': true
  };
  options.model = model;

  function onOpen() {
    console.log('Socket opened');
  }

  function onListening(socket) {
    console.log('Socket listening');
    callback(socket);
  }

  function onMessage(msg) {
    if (msg.results) {
      // Convert to closure approach
      baseString = display.showResult(msg, baseString, model);
      baseJSON = JSON.stringify(msg, null, 2);
      display.showJSON(baseJSON);
    }
  }

  function onError(evt) {
    localStorage.setItem('currentlyDisplaying', 'false');
    onend(evt);
    console.log('Socket err: ', evt.code);
  }

  function onClose(evt) {
    localStorage.setItem('currentlyDisplaying', 'false');
    onend(evt);
    console.log('Socket closing: ', evt);
  }

  initSocket(options, onOpen, onListening, onMessage, onError, onClose);
};

},{"./socket":7,"./views/displaymetadata":10}],4:[function(require,module,exports){
/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* global $ */
'use strict';

var initSocket = require('./socket').initSocket;
var display = require('./views/displaymetadata');

exports.handleMicrophone = function(token, model, mic, callback) {

  if (model.indexOf('Narrowband') > -1) {
    var err = new Error('Microphone transcription cannot accomodate narrowband models, ' +
      'please select another');
    callback(err, null);
    return false;
  }

  $.publish('clearscreen');

  // Test out websocket
  var baseString = '';
  var baseJSON = '';

  $.subscribe('showjson', function() {
    var $resultsJSON = $('#resultsJSON');
    $resultsJSON.val(baseJSON);
  });

  var keywords = display.getKeywordsToSearch();
  var keywords_threshold = keywords.length == 0 ? null : 0.01;

  var options = {};
  options.token = token;
  options.message = {
    'action': 'start',
    'content-type': 'audio/l16;rate=16000',
    'interim_results': true,
    'continuous': true,
    'word_confidence': true,
    'timestamps': true,
    'max_alternatives': 3,
    'inactivity_timeout': 600,
    'word_alternatives_threshold': 0.001,
    'keywords_threshold': keywords_threshold,
    'keywords': keywords,
    'smart_formatting': true
  };
  options.model = model;

  function onOpen(socket) {
    console.log('Mic socket: opened');
    callback(null, socket);
  }

  function onListening(socket) {
    mic.onAudio = function(blob) {
      if (socket.readyState < 2) {
        socket.send(blob);
      }
    };
  }

  function onMessage(msg) {
    if (msg.results) {
      // Convert to closure approach
      baseString = display.showResult(msg, baseString, model);
      baseJSON = JSON.stringify(msg, null, 2);
      display.showJSON(baseJSON);
    }
  }

  function onError() {
    console.log('Mic socket err: ', err);
  }

  function onClose(evt) {
    console.log('Mic socket close: ', evt);
  }

  initSocket(options, onOpen, onListening, onMessage, onError, onClose);
};

},{"./socket":7,"./views/displaymetadata":10}],5:[function(require,module,exports){
/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* global $:false, BUFFERSIZE */

'use strict';

var models = require('./data/models.json').models;
var utils = require('./utils');
utils.initPubSub();
var initViews = require('./views').initViews;
var showerror = require('./views/showerror');
var showError = showerror.showError;
var getModels = require('./models').getModels;

window.BUFFERSIZE = 8192;

$(document).ready(function() {
  var tokenGenerator = utils.createTokenGenerator();

  // Make call to API to try and get token
  tokenGenerator.getToken(function(err, token) {
    window.onbeforeunload = function() {
      localStorage.clear();
    };

    if (!token) {
      console.error('No authorization token available');
      console.error('Attempting to reconnect...');

      if (err && err.code)
        showError('Server error ' + err.code + ': ' + err.error);
      else
        showError('Server error ' + err.code + ': please refresh your browser and try again');
    }

    var viewContext = {
      currentModel: 'es-ES_BroadbandModel',
      models: models,
      token: token,
      bufferSize: BUFFERSIZE
    };

    initViews(viewContext);

    // Save models to localstorage
    localStorage.setItem('models', JSON.stringify(models));

    // Check if playback functionality is invoked
    localStorage.setItem('playbackON', false);
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
      var pair = vars[i].split('=');
      if (decodeURIComponent(pair[0]) === 'debug') {
        localStorage.setItem('playbackON',decodeURIComponent(pair[1]));
      }
    }

    // Set default current model
    localStorage.setItem('currentModel', 'es-ES_BroadbandModel');
    localStorage.setItem('sessionPermissions', 'true');

    getModels(token);

    $.subscribe('clearscreen', function() {
      $('#resultsText').text('');
      $('#resultsJSON').text('');
      $('.error-row').hide();
      $('.notification-row').hide();
      $('.hypotheses > ul').empty();
      $('#metadataTableBody').empty();
    });

  });

});

},{"./data/models.json":2,"./models":6,"./utils":8,"./views":14,"./views/showerror":19}],6:[function(require,module,exports){
/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';
var selectModel = require('./views/selectmodel').initSelectModel;

exports.getModels = function(token) {
  var viewContext = {
    currentModel: 'es-ES_BroadbandModel',
    models: null,
    token: token,
    bufferSize: BUFFERSIZE
  };
  var modelUrl = 'https://stream.watsonplatform.net/speech-to-text/api/v1/models';
  var sttRequest = new XMLHttpRequest();
  sttRequest.open('GET', modelUrl, true);
  sttRequest.withCredentials = true;
  sttRequest.setRequestHeader('Accept', 'application/json');
  sttRequest.setRequestHeader('X-Watson-Authorization-Token', token);
  sttRequest.onload = function() {
    var response = JSON.parse(sttRequest.responseText);
    var sorted = response.models.sort(function(a,b) {
      if (a.name > b.name) {
        return 1;
      }
      if (a.name < b.name) {
        return -1;
      }
      return 0;
    });
    response.models = sorted;
    localStorage.setItem('models', JSON.stringify(response.models));
    viewContext.models = response.models;
    selectModel(viewContext);
  };
  sttRequest.onerror = function() {
    viewContext.models = require('./data/models.json').models;
    selectModel(viewContext);
  };
  sttRequest.send();
};

},{"./data/models.json":2,"./views/selectmodel":17}],7:[function(require,module,exports){
/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* global $:false */

'use strict';

var utils = require('./utils');
var showerror = require('./views/showerror');
var showError = showerror.showError;

// Mini WS callback API, so we can initialize
// with model and token in URI, plus
// start message

// Initialize closure, which holds maximum getToken call count
var tokenGenerator = utils.createTokenGenerator();

var initSocket = exports.initSocket = function(options, onopen, onlistening, onmessage, onerror, onclose) {
  var listening;
  // function withDefault(val, defaultVal) {
  //   return typeof val === 'undefined' ? defaultVal : val;
  // }
  var socket;
  var token = options.token;
  var model = options.model || localStorage.getItem('currentModel');
  var message = options.message || {'action': 'start'};
  // var sessionPermissions = withDefault(options.sessionPermissions,
  //   JSON.parse(localStorage.getItem('sessionPermissions')));
  // var sessionPermissionsQueryParam = sessionPermissions ? '0' : '1';
  // TODO: add '&X-Watson-Learning-Opt-Out=' + sessionPermissionsQueryParam once
  // we find why it's not accepted as query parameter
  var url = options.serviceURI || 'wss://stream.watsonplatform.net/speech-to-text/api/v1/recognize?watson-token=';
  url += token + '&model=' + model;
  console.log('URL model', model);
  try {
    socket = new WebSocket(url);
  } catch (err) {
    console.error('WS connection error: ', err);
  }
  socket.onopen = function() {
    listening = false;
    $.subscribe('hardsocketstop', function() {
      console.log('MICROPHONE: close.');
      socket.send(JSON.stringify({action:'stop'}));
      socket.close();
    });
    $.subscribe('socketstop', function() {
      console.log('MICROPHONE: close.');
      socket.close();
    });
    socket.send(JSON.stringify(message));
    onopen(socket);
  };
  socket.onmessage = function(evt) {
    var msg = JSON.parse(evt.data);
    if (msg.error) {
      showError(msg.error);
      $.publish('hardsocketstop');
      return;
    }
    if (msg.state === 'listening') {
      // Early cut off, without notification
      if (!listening) {
        onlistening(socket);
        listening = true;
      } else {
        console.log('MICROPHONE: Closing socket.');
        socket.close();
      }
    }
    onmessage(msg, socket);
  };

  socket.onerror = function(evt) {
    console.log('WS onerror: ', evt);
    showError('Application error ' + evt.code + ': please refresh your browser and try again');
    $.publish('clearscreen');
    onerror(evt);
  };

  socket.onclose = function(evt) {
    console.log('WS onclose: ', evt);
    if (evt.code === 1006) {
      // Authentication error, try to reconnect
      console.log('generator count', tokenGenerator.getCount());
      if (tokenGenerator.getCount() > 1) {
        $.publish('hardsocketstop');
        throw new Error('No authorization token is currently available');
      }
      tokenGenerator.getToken(function(err, token) {
        if (err) {
          $.publish('hardsocketstop');
          return false;
        }
        console.log('Fetching additional token...');
        options.token = token;
        initSocket(options, onopen, onlistening, onmessage, onerror, onclose);
      });
      return false;
    }
    if (evt.code === 1011) {
      console.error('Server error ' + evt.code + ': please refresh your browser and try again');
      return false;
    }
    if (evt.code > 1000) {
      console.error('Server error ' + evt.code + ': please refresh your browser and try again');
      return false;
    }
    // Made it through, normal close
    $.unsubscribe('hardsocketstop');
    $.unsubscribe('socketstop');
    onclose(evt);
  };

};

},{"./utils":8,"./views/showerror":19}],8:[function(require,module,exports){
(function (global){
/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// For non-view logic
var $ = (typeof window !== "undefined" ? window['jQuery'] : typeof global !== "undefined" ? global['jQuery'] : null);

var fileBlock = function(_offset, length, _file, readChunk) {
  var r = new FileReader();
  var blob = _file.slice(_offset, length + _offset);
  r.onload = readChunk;
  r.readAsArrayBuffer(blob);
};

// Based on alediaferia's SO response
// http://stackoverflow.com/questions/14438187/javascript-filereader-parsing-long-file-in-chunks
exports.onFileProgress = function(options, ondata, running, onerror, onend, samplingRate) {
  var file = options.file;
  var fileSize = file.size;
  var chunkSize = options.bufferSize || 16000;  // in bytes
  var offset = 0;
  var readChunk = function(evt) {
    if (offset >= fileSize) {
      console.log('Done reading file');
      onend();
      return;
    }
    if (!running()) {
      return;
    }
    if (evt.target.error == null) {
      var buffer = evt.target.result;
      var len = buffer.byteLength;
      offset += len;
      // console.log('sending: ' + len);
      ondata(buffer); // callback for handling read chunk
    } else {
      var errorMessage = evt.target.error;
      console.log('Read error: ' + errorMessage);
      onerror(errorMessage);
      return;
    }
    // use this timeout to pace the data upload for the playSample case,
    // the idea is that the hyps do not arrive before the audio is played back
    if (samplingRate) {
      // console.log('samplingRate: ' +
      //  samplingRate + ' timeout: ' + (chunkSize * 1000) / (samplingRate * 2));
      setTimeout(function() {
        fileBlock(offset, chunkSize, file, readChunk);
      }, (chunkSize * 1000) / (samplingRate * 2));
    } else {
      fileBlock(offset, chunkSize, file, readChunk);
    }
  };
  fileBlock(offset, chunkSize, file, readChunk);
};

exports.createTokenGenerator = function() {
  // Make call to API to try and get token
  var hasBeenRunTimes = 0;
  return {
    getToken: function(callback) {
      ++hasBeenRunTimes;
      if (hasBeenRunTimes > 5) {
        var err = new Error('Cannot reach server');
        callback(null, err);
        return;
      }
      var url = '/api/token';
      var tokenRequest = new XMLHttpRequest();
      tokenRequest.open('POST', url, true);
      tokenRequest.setRequestHeader('csrf-token',$('meta[name="ct"]').attr('content'));
      tokenRequest.onreadystatechange = function() {
        if (tokenRequest.readyState === 4) {
          if (tokenRequest.status === 200) {
            var token = tokenRequest.responseText;
            callback(null, token);
          } else {
            var error = 'Cannot reach server';
            if (tokenRequest.responseText){
              try {
                error = JSON.parse(tokenRequest.responseText);
              } catch (e) {
                error = tokenRequest.responseText;
              }
            }
            callback(error);
          }
        }
      };
      tokenRequest.send();
    },
    getCount: function() { return hasBeenRunTimes; }
  };
};

exports.initPubSub = function() {
  var o = $({});
  $.subscribe = o.on.bind(o);
  $.unsubscribe = o.off.bind(o);
  $.publish = o.trigger.bind(o);
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],9:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* global $ */
'use strict';

/* eslint no-invalid-this: 0*/

exports.initAnimatePanel = function() {
  $('.panel-heading span.clickable').on('click', function() {
    if ($(this).hasClass('panel-collapsed')) {
      // expand the panel
      $(this).parents('.panel').find('.panel-body').slideDown();
      $(this).removeClass('panel-collapsed');
      $(this).find('i').removeClass('caret-down').addClass('caret-up');
    } else {
      // collapse the panel
      $(this).parents('.panel').find('.panel-body').slideUp();
      $(this).addClass('panel-collapsed');
      $(this).find('i').removeClass('caret-up').addClass('caret-down');
    }
  });
};

},{}],10:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* global $ */
/* eslint no-invalid-this: 0, brace-style: 0, dot-notation: 0, spaced-comment:0 */
'use strict';

const INITIAL_OFFSET_X = 30;
const INITIAL_OFFSET_Y = 30;
const fontSize = 16;
const delta_y = 2 * fontSize;
const radius = 5;
const space = 4;
const hstep = 32;
const timeout = 500;
const defaultFont = fontSize + 'px Arial';
const boldFont = 'bold ' + fontSize + 'px Arial';
const italicFont = 'italic ' + fontSize + 'px Arial';
const opacity = '0.6';

var showAllHypotheses = true;
var keywordsInputDirty = false;
var keywords_to_search = [];
var detected_keywords = {};
var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');
var hslider = document.getElementById('hslider');
var vslider = document.getElementById('vslider');
var leftArrowEnabled = false;
var rightArrowEnabled = false;
var worker = null;
var runTimer = false;
var scrolled = false;
// var textScrolled = false;
var pushed = 0;
var popped = 0;

ctx.font = defaultFont;

// -----------------------------------------------------------
// class WordAlternative
var WordAlternative = function(text, confidence) {
  if (text == '<eps>') {
    this._text = '<silence>';
    this._foreColor = '#888';
  }
  else if (text == '%HESITATION') {
    this._text = '<hesitation>';
    this._foreColor = '#888';
  }
  else {
    this._foreColor = '#000';
    this._text = text;
  }
  this._confidence = confidence;
  this._height = 2 * fontSize;
  ctx.font = defaultFont;
  this._width = ctx.measureText(this._text + ((this._confidence.toFixed(3) * 100).toFixed(1)) + '%').width + 60;
  this._fillStyle = '#f4f4f4';
  this._selectedFillStyle = '#e3e3e3';
  this._selected = false;
};

WordAlternative.prototype.width = function() {
  return this._width;
};

WordAlternative.prototype.height = function() {
  return this._height;
};

WordAlternative.prototype.width = function() {
  return this._width;
};

WordAlternative.prototype.select = function() {
  this._selected = true;
};

WordAlternative.prototype.unselect = function() {
  this._selected = false;
};

WordAlternative.prototype.draw = function(x, y, width) {
  ctx.fillStyle = this._selected ? this._selectedFillStyle : this._fillStyle;
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#d3d3d3';
  ctx.fillRect(x, y, width, this.height());
  ctx.strokeRect(x, y, width, this.height());

  ctx.fillStyle = this._foreColor;
  ctx.font = this._selected ? boldFont : defaultFont;
  ctx.fillText(this._text, x + 16, y + 20);
  ctx.font = italicFont;
  const appendix = (this._confidence.toFixed(3) * 100).toFixed(1) + '%';
  const rightOffset = ctx.measureText(appendix).width + 32;
  ctx.fillText(appendix, x + 16 + width - rightOffset, y + 20);
  ctx.font = defaultFont;
};

// -----------------------------------------------------------
// class Bin
var Bin = function(startTime, endTime) {
  this._connectorWidth = 40;
  this._startTime = startTime;
  this._endTime = endTime;
  this._wordAlternatives = [];
  this._maxWordAlternativeWidth = 0;
  this._height = 0;
  this._index = 0;
};

Bin.prototype.addWordAlternative = function(wa) {
  this._wordAlternatives.push(wa);
  for (var index = 0; index < this._wordAlternatives.length; index++) {
    var width = this._wordAlternatives[index].width();
    if (width > this._maxWordAlternativeWidth)
      this._maxWordAlternativeWidth = width;
  }
  this._height += wa.height();
};

Bin.prototype.height = function() {
  return this._height;
};

Bin.prototype.width = function() {
  return this._maxWordAlternativeWidth + 2 * this._connectorWidth;
};

Bin.prototype.draw = function(x, y) {
  for (var index = 0; index < this._wordAlternatives.length; index++) {
    var wa = this._wordAlternatives[index];
    wa.draw(x + this._connectorWidth, y + delta_y * (index + 1), this._maxWordAlternativeWidth);
    if (showAllHypotheses == false)
      break;
  }

  ctx.moveTo(x + space + radius, y + fontSize);
  if (this._wordAlternatives.length > 0) {
    ctx.strokeStyle = '#4178BE';
    ctx.lineWidth = 2;
    ctx.lineTo(x + this.width() - (space + radius), y + fontSize);
    ctx.stroke();
  }
};

// -----------------------------------------------------------
// class Scene
var Scene = function() {
  this._bins = [];
  this._offset_X = INITIAL_OFFSET_X;
  this._offset_Y = INITIAL_OFFSET_Y;
  this._width = 0;
  this._height = 0;
  this._shift = 100;
};

Scene.prototype.draw = function() {
  var x = this._offset_X;
  var y = this._offset_Y;
  var last_bin_end_time = 0;

  for (var index = 0; index < this._bins.length; index++) {
    var bin = this._bins[index];
    var x_visible = Math.abs(x) <= canvas.width;
    ctx.beginPath();

    if (bin._startTime > last_bin_end_time) {
      if (x_visible) {
        ctx.moveTo(x + radius + space, y + fontSize);
      }
      if (last_bin_end_time > 0) {
        x += this._shift;
        if (x_visible) {
          ctx.strokeStyle = '#4178BE';
          ctx.lineWidth = 2;
          ctx.lineTo(x - (radius + space), y + fontSize);
          ctx.stroke();
        }
      }
      if (x_visible) {
        ctx.moveTo(x + radius, y + fontSize);
        ctx.lineWidth = 2;
        ctx.arc(x, y + fontSize, radius, 0, 2 * Math.PI, false);
        var start_time_caption = bin._startTime + ' s';
        var start_time_shift = ctx.measureText(start_time_caption).width / 2;
        ctx.fillText(start_time_caption, x - start_time_shift, y);
        ctx.stroke();
      }
    }

    if (x_visible) {
      bin.draw(x, y);
      ctx.moveTo(x + bin.width() + radius, y + fontSize);
      ctx.strokeStyle = '#4178BE';
      ctx.lineWidth = 2;
      ctx.arc(x + bin.width(), y + fontSize, radius, 0, 2 * Math.PI, false);
      ctx.stroke();
      var end_time_caption = bin._endTime + ' s';
      var end_time_shift = ctx.measureText(end_time_caption).width / 2;
      ctx.fillText(end_time_caption, x + bin.width() - end_time_shift, y);
      ctx.stroke();
    }

    last_bin_end_time = bin._endTime;
    x += bin.width();
    ctx.closePath();
  }
};

Scene.prototype.addBin = function(bin) {
  bin._index = this._bins.length;
  this._bins.push(bin);
  var width = 2 * INITIAL_OFFSET_X;
  var last_bin_end_time = 0;
  for (var index = 0; index < this._bins.length; index++) {
    // eslint-disable-next-line no-redeclare
    var bin = this._bins[index];
    if (bin._startTime > last_bin_end_time && last_bin_end_time > 0) {
      width += this._shift;
    }
    last_bin_end_time = bin._endTime;
    width += bin.width();
    if (this._height < bin.height()) {
      this._height = bin.height();
      vslider.min = canvas.height - this._height - 2.5 * INITIAL_OFFSET_Y;
    }
  }
  this._width = width;
};

Scene.prototype.width = function() {
  return this._width + 2 * this._shift;
};

Scene.prototype.height = function() {
  return this._height;
};

Scene.prototype.findBins = function(start_time, end_time) {
  var foundBins = [];
  for (var index = 0; index < this._bins.length; index++) {
    var bin = this._bins[index];
    var binStartTime = bin._startTime;
    var binEndTime = bin._endTime;
    if (binStartTime >= start_time && binEndTime <= end_time) {
      foundBins.push(bin);
    }
  }
  return foundBins;
};

Scene.prototype.startTimeToSliderValue = function(start_time) {
  var last_bin_end_time = 0;
  var value = 0;
  for (var binIndex = 0; binIndex < this._bins.length; binIndex++) {
    var bin = this._bins[binIndex];
    if (bin._startTime < start_time) {
      value += bin.width();
      if (bin._startTime > last_bin_end_time && last_bin_end_time > 0) {
        // eslint-disable-next-line no-use-before-define
        value += scene._shift;
      }
      last_bin_end_time = bin._endTime;
    }
  }
  return value;
};

// ---------------------------------------------------------------------

var scene = new Scene();

function parseAlternative(element/*, index, array*/) {
  var confidence = element['confidence'];
  var word = element['word'];
  var bin = scene._bins[scene._bins.length - 1];
  bin.addWordAlternative(new WordAlternative(word, confidence));
}

function parseBin(element/*, index, array*/) {
  var start_time = element['start_time'];
  var end_time = element['end_time'];
  var alternatives = element['alternatives'];
  var bin = new Bin(start_time, end_time);
  scene.addBin(bin);
  alternatives.forEach(parseAlternative);
}

function draw() {
  ctx.clearRect(0, 0, 970, 370);
  scene.draw();
}

function onHScroll() {
  if (hslider.value == 0) {
    leftArrowEnabled = false;
    rightArrowEnabled = true;
    $('#left-arrow').attr('src', 'images/arrow-left-icon-disabled.svg');
    $('#left-arrow').css('background-color', 'transparent');
    $('#right-arrow').attr('src', 'images/arrow-right-icon.svg');
    $('#right-arrow').css('background-color', '#C7C7C7');
  }
  else if (hslider.value == Math.floor(hslider.max)) {
    leftArrowEnabled = true;
    rightArrowEnabled = false;
    $('#left-arrow').attr('src', 'images/arrow-left-icon.svg');
    $('#left-arrow').css('background-color', '#C7C7C7');
    $('#right-arrow').attr('src', 'images/arrow-right-icon-disabled.svg');
    $('#right-arrow').css('background-color', 'transparent');
  }
  else {
    leftArrowEnabled = true;
    rightArrowEnabled = true;
    $('#left-arrow').attr('src', 'images/arrow-left-icon.svg');
    $('#left-arrow').css('background-color', '#C7C7C7');
    $('#right-arrow').attr('src', 'images/arrow-right-icon.svg');
    $('#right-arrow').css('background-color', '#C7C7C7');
  }
  scene._offset_X = INITIAL_OFFSET_X - hslider.value;
  draw();
}

function onVScroll() {
  scene._offset_Y = INITIAL_OFFSET_Y + Number(vslider.value);
  draw();
}

function clearScene() {
  scene._bins = [];
  scene._width = 0;
  scene._height = 0;
  scene._offset_X = INITIAL_OFFSET_X;
  scene._offset_Y = INITIAL_OFFSET_Y;
  hslider.max = 0;
  hslider.value = hslider.max;
  vslider.max = 0;
  vslider.min = 0;
  vslider.value = vslider.max;
  $('#hslider').css('display', 'none');
  $('#vslider').css('display', 'none');
  $('#show_alternate_words').css('display', 'none');
  $('#canvas').css('display', 'none');
  $('#canvas-placeholder').css('display', 'block');
  $('#left-arrow').css('display', 'none');
  $('#right-arrow').css('display', 'none');

  showAllHypotheses = true;
  $('#show_alternate_words').text('Hide alternate words');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function clearKeywordsToSearch() {
  keywords_to_search = [];
  $('#error-wrong-keywords-filetype').css('display', 'none');
  $('.keywords_title').css('display', 'none');
  $('#keywords').css('display', 'none');
  $('#transcription_text').css('width', '100%');
}

function clearDetectedKeywords() {
  $('#keywords ul').empty();
  detected_keywords = {};
}

// ---------------------------------------------------------------------

$('#left-arrow').hover(
  function() {
    if (leftArrowEnabled) {
      $(this).css('background-color', '#C7C7C7');
      $(this).css('opacity', '1');
    }
    else {
      $(this).css('background-color', 'transparent');
      $(this).css('opacity', opacity);
    }
  },
  function() {
    if (leftArrowEnabled) {
      $(this).css('background-color', '#C7C7C7');
    }
    else {
      $(this).css('background-color', 'transparent');
    }
    $(this).css('opacity', opacity);
  }
);

$('#right-arrow').hover(
  function() {
    if (rightArrowEnabled) {
      $(this).css('background-color', '#C7C7C7');
      $(this).css('opacity', '1');
    }
    else {
      $(this).css('background-color', 'transparent');
      $(this).css('opacity', opacity);
    }
  },
  function() {
    if (rightArrowEnabled) {
      $(this).css('background-color', '#C7C7C7');
    }
    else {
      $(this).css('background-color', 'transparent');
    }
    $(this).css('opacity', opacity);
  }
);

$('#left-arrow').click(function() {
  var updated_value = hslider.value - hstep;
  if (updated_value < 0) {
    updated_value = 0;
  }
  hslider.value = updated_value;
  onHScroll();
});

$('#right-arrow').click(function() {
  var updated_value = Number(hslider.value) + hstep;
  if (updated_value > hslider.max) {
    updated_value = hslider.max;
  }
  hslider.value = updated_value;
  onHScroll();
});

$('#btnLoadKWS').click(function(/*e*/) {
  $(this).find('input[type=\'file\']').click();
});

$('#btnLoadKWS input').click(function(e) {
  e.stopPropagation();
});

$('#btnLoadKWS input').change(function(e) {
  e.stopPropagation();
  clearKeywordsToSearch();
  var selectedFile = $(this)[0].files[0];
  if (typeof selectedFile == 'undefined') {
    console.log('User cancelled OpenFile dialog. No keywords file loaded.');
    return;
  }

  if ($(this).val().lastIndexOf('.txt') == -1) {
    $('#error-wrong-keywords-filetype').css('display', 'block');
    return;
  }

  var reader = new FileReader();
  reader.readAsText(selectedFile);
  reader.onload = function() {
    $('#keywords ul').empty();
    var text = reader.result;
    var keywordsToSearch = text.split('\n');
    // eslint-disable-next-line no-use-before-define
    keywordsToSearch.forEach(addKeywordToSearch);
    if (keywordsToSearch.length > 0) {
      $('.keywords_title').css('display', 'block');
      $('#keywords').css('display', 'block');
      $('#transcription_text').css('width', '55%');
    }
  };
});

$('#tb_keywords').focus(function () {
  if (keywordsInputDirty == false) {
    keywordsInputDirty = true;
    $(this).css('font-style', 'normal');
    $(this).css('color', '#121212');
    $(this).val('');
  }
});

$('#tb_keywords').change(function() {
  clearKeywordsToSearch();
  var text = $(this).val();
  // eslint-disable-next-line no-use-before-define
  text.split(',').forEach(addKeywordToSearch);
  if (keywords_to_search.length > 0) {
    $('.keywords_title').css('display', 'block');
    $('#keywords').css('display', 'block');
    $('#transcription_text').css('width', '55%');
  }
});

// -----------------------------------------------------------------

function keywordNotFound(keyword) {
  var $li_kwd = $('<li class=\'keyword_no_occurrences\'/>');
  $li_kwd.append(document.createTextNode(keyword));
  $('#keywords ul').append($li_kwd);
}

function addKeywordToSearch(element/*, index, array*/) {
  var keyword = element.trim();
  if (keyword.length == 0) return;

  if (keywords_to_search.indexOf(keyword) == -1) {
    keywords_to_search.push(keyword);
  }
}

$('#errorWrongKeywordsFiletypeClose').click(function(/*e*/) {
  $('#error-wrong-keywords-filetype').css('display', 'none');
});

function toggleSpottedKeywordClass(node) {
  if (node.className == 'keyword_collapsed') {
    node.getElementsByClassName('keyword_icon')[0].src = 'images/close-icon.svg';
    node.className = 'keyword_expanded';
  }
  else if (node.className == 'keyword_expanded') {
    node.getElementsByClassName('keyword_icon')[0].src = 'images/open-icon.svg';
    node.className = 'keyword_collapsed';
  }
}

$('#keywords ul').click(function(e) {
  var node = e.srcElement || e.target;

  if (node.className == 'keyword_text') {
    toggleSpottedKeywordClass(node.parentNode);
  }
  else if (node.className == 'keyword_icon') {
    toggleSpottedKeywordClass(node.parentNode.parentNode);
  }
  else {
    toggleSpottedKeywordClass(node);
  }
});

function parseKeywords(keywords_result) {
  // eslint-disable-next-line guard-for-in
  for (var keyword in keywords_result) {
    var arr = keywords_result[keyword];
    // eslint-disable-next-line no-continue
    if (arr.length == 0) continue;
    if (keyword in detected_keywords == false) {
      detected_keywords[keyword] = [];
    }
    detected_keywords[keyword] = detected_keywords[keyword].concat(arr);
  }
}

function unselectLastKeyword() {
  for (var binIndex = 0; binIndex < scene._bins.length; binIndex++) {
    var bin = scene._bins[binIndex];
    var wordAlternatives = bin._wordAlternatives;
    for (var waIndex = 0; waIndex < wordAlternatives.length; waIndex++) {
      var wordAlternative = wordAlternatives[waIndex];
      wordAlternative.unselect();
    }
  }
}

window.onKeywordOccurrenceSelected = function(start_time, keywordFragments) {
  unselectLastKeyword();
  var keywordConsistsOfTopHypothesesOnly = true;
  for (var index = 0; index < keywordFragments.length; index++) {
    var fragment = keywordFragments[index];
    var binIndex = fragment[0];
    var waIndex = fragment[1];
    if (waIndex > 0) {
      keywordConsistsOfTopHypothesesOnly = false;
    }
    var bin = scene._bins[binIndex];
    var wordAlternative = bin._wordAlternatives[waIndex];
    wordAlternative.select();
  }
  if (showAllHypotheses == false && keywordConsistsOfTopHypothesesOnly == false) {
    // eslint-disable-next-line no-use-before-define
    toggleAlternateWords();
  }
  hslider.value = scene.startTimeToSliderValue(start_time);
  onHScroll();

  $('html, body').animate({scrollTop: $('#canvas').offset().top}, 500);
};

function keywordToHashSet(normalized_text) {
  var hashSet = {};
  var segments = normalized_text.split(' ');
  for (var index = 0; index < segments.length; index++) {
    var segment = segments[index];
    hashSet[segment] = true;
  }
  return hashSet;
}

function updateKeyword(keyword) {
  var arr = detected_keywords[keyword];
  var arrlen = arr.length;

  var $li = $('<li class=\'keyword_collapsed\'/>');
  var $keyword_text = $('<span class=\'keyword_text\'><img class=\'keyword_icon\' src=\'images/open-icon.svg\'>' + keyword + '</span>');
  var $keyword_count = $('<span class=\'keyword_count\'>(' + arrlen + ')</span>');
  $li.append($keyword_text);
  $li.append($keyword_count);
  var $table = $('<table class=\'kws_occurrences\'/>');
  for (var index = 0; index < arrlen; index++) {
    var kwd_occurrence = arr[index];
    var start_time = kwd_occurrence['start_time'].toFixed(2);
    var end_time = kwd_occurrence['end_time'].toFixed(2);
    var confidence = (kwd_occurrence['confidence'] * 100).toFixed(1);
    var normalized_text = kwd_occurrence['normalized_text'];
    var set = keywordToHashSet(normalized_text);
    var foundBins = scene.findBins(start_time, end_time);
    var keywordFragments = [];

    for (var binIndex = 0; binIndex < foundBins.length; binIndex++) {
      var bin = foundBins[binIndex];
      var wordAlternatives = bin._wordAlternatives;
      for (var waIndex = 0; waIndex < wordAlternatives.length; waIndex++) {
        var wordAlternative = wordAlternatives[waIndex];
        var isKeyword = set[wordAlternative._text];
        if (isKeyword) {
          var coordinate = [bin._index, waIndex];
          keywordFragments.push(coordinate);
        }
      }
    }

    var onClick = '"onKeywordOccurrenceSelected(' + start_time + ',' + JSON.stringify(keywordFragments) + ')"';
    var $tr = $('<tr class=\'selectable\' onClick=' + onClick + '/>');
    var $td_index = $('<td class=\'index\'>' + (index + 1) + '.</td>');
    var $td_start_label = $('<td class=\'bold\'>Start:</td>');
    var $td_start = $('<td/>');
    $td_start.append(document.createTextNode(start_time));
    var $td_end_label = $('<td class=\'bold\'>End:</td>');
    var $td_end = $('<td/>');
    $td_end.append(document.createTextNode(end_time));
    var $td_confidence_label = $('<td class=\'bold\'>Confidence:</td>');
    var $td_confidence = $('<td/>');
    $td_confidence.append(document.createTextNode(confidence + '%'));
    $tr.append([$td_index, $td_start_label, $td_start, $td_end_label, $td_end, $td_confidence_label, $td_confidence]);
    $table.append($tr);
  }
  $li.append($table);
  $('#keywords ul').append($li);
}

function updateDetectedKeywords() {
  $('#keywords ul').empty();
  keywords_to_search.forEach(function(element/*, index, array*/) {
    var keyword = element;
    if (keyword in detected_keywords) {
      updateKeyword(keyword);
    }
    else {
      keywordNotFound(keyword);
    }
  });
}

function toggleAlternateWords() {
  if (showAllHypotheses == false) {
    if (vslider.min < 0) {
      $('#vslider').css('display', 'block');
    }
    $('#show_alternate_words').text('Hide alternate words');
    showAllHypotheses = true;
  }
  else {
    $('#vslider').css('display', 'none');
    $('#show_alternate_words').text('Show alternate words');
    showAllHypotheses = false;
  }
  draw();
}

$('#show_alternate_words').click(function(/*e*/) {
  toggleAlternateWords();
});

exports.showJSON = function(baseJSON) {
  if ($('.nav-tabs .active').text() == 'JSON') {
    $('#resultsJSON').val(baseJSON);
  }
};

function updateTextScroll(){
  if (!scrolled){
    var element = $('#resultsText').get(0);
    element.scrollTop = element.scrollHeight;
  }
}

function initTextScroll() {
  // $('#resultsText').on('scroll', function(){
  //     textScrolled = true;
  // });
}

function onResize() {
  var dpr = window.devicePixelRatio || 1;
  var bsr = ctx.webkitBackingStorePixelRatio ||
  ctx.mozBackingStorePixelRatio ||
  ctx.msBackingStorePixelRatio ||
  ctx.oBackingStorePixelRatio ||
  ctx.backingStorePixelRatio || 1;
  var ratio = dpr / bsr;
  console.log('dpr/bsr =', ratio);
  var w = $('#canvas').width();
  var h = $('#canvas').height();
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

function resetWorker() {
  runTimer = false;
  worker.postMessage({
    type:'clear'
  });
  pushed = 0;
  popped = 0;
  console.log('---> resetWorker called');
}

exports.initDisplayMetadata = function() {
  initTextScroll();
  keywordsInputDirty = false;
  hslider.min = 0;
  hslider.max = 0;
  hslider.value = hslider.min;
  vslider.min = 0;
  vslider.max = 0;
  vslider.value = vslider.max;
  $('#vslider').css('display', 'none');
  $('#hslider').on('change mousemove', function() {
    onHScroll();
  });
  $('#vslider').on('change mousemove', function() {
    onVScroll();
  });

  $('#canvas').css('display', 'none');
  $('#canvas-placeholder').css('display', 'block');
  $('#left-arrow').css('display', 'none');
  $('#right-arrow').css('display', 'none');

  onResize(); // to adjust the canvas size

  var workerScriptBody =
    'var fifo = [];\n' +
    'var onmessage = function(event) {\n' +
    '  var payload = event.data;\n' +
    '  var type = payload.type;\n' +
    '  if(type == \'push\') {\n' +
    '    fifo.push(payload.msg);\n' +
    '  }\n' +
    '  else if(type == \'shift\' && fifo.length > 0) {\n' +
    '    var msg = fifo.shift();\n' +
    '    postMessage({\n' +
    '     bins:msg.results[0].word_alternatives,\n' +
    '     kws:msg.results[0].keywords_result\n' +
    '    });\n' +
    '  }\n' +
    '  else if(type == \'clear\') {\n' +
    '    fifo = [];\n' +
    '    console.log(\'worker: fifo cleared\');\n' +
    '  }\n' +
    '}\n';

  var blobURL = window.URL.createObjectURL(new Blob([workerScriptBody]));
  worker = new Worker(blobURL);
  worker.onmessage = function(event) {
    var data = event.data;
    // eslint-disable-next-line no-use-before-define
    showCNsKWS(data.bins, data.kws);
    popped++;
    console.log('----> popped', popped);
  };
};

function showCNsKWS(bins, kws) {
  bins.forEach(parseBin);
  hslider.max = scene.width() - canvas.width + INITIAL_OFFSET_X;
  hslider.value = hslider.max;
  onHScroll();

  if (vslider.min < 0 && showAllHypotheses) {
    $('#vslider').css('display', 'block');
  }
  $('#hslider').css('display', 'block');
  $('#show_alternate_words').css('display', 'inline-block');
  $('#canvas').css('display', 'block');
  $('#canvas-placeholder').css('display', 'none');
  $('#left-arrow').css('display', 'inline-block');
  $('#right-arrow').css('display', 'inline-block');

  // KWS
  parseKeywords(kws);
  updateDetectedKeywords();
}

function onTimer() {
  worker.postMessage({
    type:'shift'
  });
  if (runTimer == true) {
    setTimeout(onTimer, timeout);
  }
}

exports.showResult = function(msg, baseString, model) {

  if (msg.results && msg.results.length > 0) {
    //var alternatives = msg.results[0].alternatives;

    var text = msg.results[0].alternatives[0].transcript || '';

    // apply mappings to beautify
    text = text.replace(/%HESITATION\s/g, '');
    //text = text.replace(/([^*])\1{2,}/g, '');   // seems to be getting in the way of smart formatting, 1000101 is converted to 1101

    if (msg.results[0].final) {
      console.log('-> ' + text);
      worker.postMessage({
        type:'push',
        msg:msg
      });
      pushed++;
      console.log('----> pushed', pushed);
      if (runTimer == false) {
        runTimer = true;
        setTimeout(onTimer, timeout);
      }
    }
    text = text.replace(/D_[^\s]+/g,'');

    // if all words are mapped to nothing then there is nothing else to do
    if ((text.length == 0) || (/^\s+$/.test(text))) {
      return baseString;
    }

    var japanese = ((model.substring(0,5) == 'ja-JP') || (model.substring(0,5) == 'zh-CN'));

    // capitalize first word
    // if final results, append a new paragraph
    if (msg.results && msg.results[0] && msg.results[0].final) {
      text = text.slice(0, -1);
      text = text.charAt(0).toUpperCase() + text.substring(1);
      if (japanese) {
        text = text.trim() + '。';
        text = text.replace(/ /g,'');
      }
      else {
        text = text.trim() + '. ';
      }
      baseString += text;

      $('#resultsText').val(text);

      clickRead(text);


    }
    else {
      if (japanese) {
        text = text.replace(/ /g,''); // remove whitespaces
      } else {
          text = text.charAt(0).toUpperCase() + text.substring(1);
      }
      $('#resultsText').val(baseString + text);
    }
  }
  updateTextScroll();
  return baseString;
};

function clickRead(valueSpeech) {
    console.log("------------------------");
    console.log(valueSpeech);
    console.log("------------------------");

    var btns = $('#action').find('a');

    /*  
    for (var i = 0;  i < btns.length ; i++) {
      console.log();
    }*/

    var arrBtn = [];
    var nameBtn = [];
    $.each( $("#action").find('a'), function( i, l ){
      console.log( $(this).prop('name') );
      arrBtn.push($(this).prop('name'));
      nameBtn.push($(this).text());
    });


    console.log("################################");
    console.log(arrBtn);
    console.log(nameBtn);
    console.log("################################");

    var match = "";
    var indexFinal = null;
    $.each( nameBtn, function( index, value){

      var aux = getMatch(valueSpeech.toUpperCase(), value.toUpperCase());


      console.log(value+"------>"+valueSpeech);
      console.log(aux.length);

      if (aux.length > match.length) {
        console.log("entro: "+value);
        match = aux;
        indexFinal = index;
      }


    });

    console.log("......................");
    console.log(match);
    console.log(indexFinal);
    console.log("......................");

    if (match.length > 3) { 
      tell_me_the_document(arrBtn[indexFinal], indexFinal);
    }else {
      console.log(":::::: falso positivo :::::::::");
    }

    $("#resultsText").val("");;
}

function getMatch(a, b){
    var i = 0;
    var j = 0;
    var result = "";
    var result2 = "";
    
    while (j < b.length){

        if (a[i] != b[j] || i == a.length){
            result += b[j];
        }else{
            if(a[i] == b[j]){
                result2 += b[j];
            }
            i++;
        }
        j++;
    }
    return result2;
}

exports.getKeywordsToSearch = function() {
  return keywords_to_search;
};

$.subscribe('clearscreen', function() {
  clearScene();
  clearDetectedKeywords();
  resetWorker();
});

$(window).resize(function() {
  onResize();
});

},{}],11:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* global $ */
'use strict';

var handleSelectedFile = require('./fileupload').handleSelectedFile;

exports.initDragDrop = function(ctx) {

  var dragAndDropTarget = $(document);

  dragAndDropTarget.on('dragenter', function(e) {
    e.stopPropagation();
    e.preventDefault();
  });

  dragAndDropTarget.on('dragover', function(e) {
    e.stopPropagation();
    e.preventDefault();
  });

  function handleFileUploadEvent(file) {
    handleSelectedFile(ctx.token, file);
  }

  dragAndDropTarget.on('drop', function(e) {
    e.preventDefault();
    var evt = e.originalEvent;

    if (evt.dataTransfer.files.length == 0)
      return;

    var file = evt.dataTransfer.files[0];
    console.log('File dropped');

    // Handle dragged file event
    handleFileUploadEvent(file);
  });


};

},{"./fileupload":13}],12:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* global $ */
'use strict';

exports.flashSVG = function(el) {
  el.css({fill: '#A53725'});
  function loop() {
    el.animate({fill: '#A53725'},
        1000, 'linear')
      .animate({fill: 'white'},
          1000, 'linear');
  }
  // return timer
  var timer = setTimeout(loop, 2000);
  return timer;
};

exports.stopFlashSVG = function(timer, el) {
  el.css({fill: 'white'});
  clearInterval(timer);
};

exports.toggleImage = function(el, name) {
  if (el.attr('src') === 'images/' + name + '.svg') {
    el.attr('src', 'images/stop-red.svg');
  } else {
    el.attr('src', 'images/stop.svg');
  }
};

var restoreImage = exports.restoreImage = function(el, name) {
  el.attr('src', 'images/' + name + '.svg');
};

exports.stopToggleImage = function(timer, el, name) {
  clearInterval(timer);
  restoreImage(el, name);
};

},{}],13:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* global $ */
'use strict';

var showError = require('./showerror').showError;
var showNotice = require('./showerror').showNotice;
var handleFileUpload = require('../handlefileupload').handleFileUpload;
var effects = require('./effects');
var utils = require('../utils');

// Need to remove the view logic here and move this out to the handlefileupload controller
var handleSelectedFile = exports.handleSelectedFile = (function() {

  var running = false;
  localStorage.setItem('currentlyDisplaying', 'false');

  return function(token, file) {

    $.publish('clearscreen');


    localStorage.setItem('currentlyDisplaying', 'fileupload');
    running = true;

    // Visual effects
    var uploadImageTag = $('#fileUploadTarget > img');
    var timer = setInterval(effects.toggleImage, 750, uploadImageTag, 'stop');
    var uploadText = $('#fileUploadTarget > span');
    uploadText.text('Stop Transcribing');

    function restoreUploadTab() {
        clearInterval(timer);
        effects.restoreImage(uploadImageTag, 'upload');
        uploadText.text('Select Audio File');
      }

    // Clear flashing if socket upload is stopped
    $.subscribe('hardsocketstop', function() {
        restoreUploadTab();
        running = false;
      });

    // Get current model
    var currentModel = localStorage.getItem('currentModel');
    console.log('currentModel', currentModel);

    // Read first 4 bytes to determine header
    var blobToText = new Blob([file]).slice(0, 4);
    var r = new FileReader();
    r.readAsText(blobToText);
    var audio;
    r.onload = function() {
        var contentType;
        if (r.result === 'fLaC') {
        contentType = 'audio/flac';
        showNotice('Notice: This browser does not support playing FLAC audio, so no audio will accompany the transcription.');
      } else if (r.result === 'RIFF') {
        contentType = 'audio/wav';
        audio = new Audio();
        var wavBlob = new Blob([file], {type: 'audio/wav'});
        var wavURL = URL.createObjectURL(wavBlob);
        audio.src = wavURL;
        audio.play();
        $.subscribe('hardsocketstop', function() {
          audio.pause();
          audio.currentTime = 0;
        });
      } else if (r.result === 'OggS') {
        contentType = 'audio/ogg; codecs=opus';
        audio = new Audio();
        var opusBlob = new Blob([file], {type: 'audio/ogg; codecs=opus'});
        var opusURL = URL.createObjectURL(opusBlob);
        audio.src = opusURL;
        audio.play();
        $.subscribe('hardsocketstop', function() {
          audio.pause();
          audio.currentTime = 0;
        });
      } else {
        restoreUploadTab();
        showError('Only WAV, FLAC, or OPUS files can be transcribed. Please try another file format.');
        localStorage.setItem('currentlyDisplaying', 'false');
        return;
      }
        handleFileUpload('fileupload', token, currentModel, file, contentType, function(socket) {
        var blob = new Blob([file]);
        var parseOptions = {
          file: blob
        };
        utils.onFileProgress(parseOptions,
          // On data chunk
          function onData(chunk) {
            socket.send(chunk);
          },
          function isRunning() {
            if (running)
              return true;
            else
                return false;
          },
          // On file read error
          function(evt) {
            console.log('Error reading file: ', evt.message);
            showError('Error: ' + evt.message);
          },
          // On load end
          function() {
            socket.send(JSON.stringify({'action': 'stop'}));
          });
      },
        function() {
          effects.stopToggleImage(timer, uploadImageTag, 'upload');
          uploadText.text('Select Audio File');
          localStorage.setItem('currentlyDisplaying', 'false');
        }
      );
      };
  };
})();


exports.initFileUpload = function(ctx) {

  var fileUploadDialog = $('#fileUploadDialog');

  fileUploadDialog.change(function() {
    var file = fileUploadDialog.get(0).files[0];
    handleSelectedFile(ctx.token, file);
  });

  $('#fileUploadTarget').click(function() {

    var currentlyDisplaying = localStorage.getItem('currentlyDisplaying');

    if (currentlyDisplaying == 'fileupload') {
      console.log('HARD SOCKET STOP');
      $.publish('hardsocketstop');
      localStorage.setItem('currentlyDisplaying', 'false');
      return;
    } else if (currentlyDisplaying == 'sample') {
      showError('Currently another file is playing, please stop the file or wait until it finishes');
      return;
    } else if (currentlyDisplaying == 'record') {
      showError('Currently audio is being recorded, please stop recording before playing a sample');
      return;
    }
    fileUploadDialog.val(null);

    fileUploadDialog
    .trigger('click');

  });

};

},{"../handlefileupload":3,"../utils":8,"./effects":12,"./showerror":19}],14:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

var initSessionPermissions = require('./sessionpermissions').initSessionPermissions;
var initAnimatePanel = require('./animatepanel').initAnimatePanel;
var initShowTab = require('./showtab').initShowTab;
var initDragDrop = require('./dragdrop').initDragDrop;
var initPlaySample = require('./playsample').initPlaySample;
var initRecordButton = require('./recordbutton').initRecordButton;
var initFileUpload = require('./fileupload').initFileUpload;
var initDisplayMetadata = require('./displaymetadata').initDisplayMetadata;

exports.initViews = function(ctx) {
  console.log('Initializing views...');
  initPlaySample(ctx);
  initDragDrop(ctx);
  initRecordButton(ctx);
  initFileUpload(ctx);
  initSessionPermissions();
  initShowTab();
  initAnimatePanel();
  initShowTab();
  initDisplayMetadata();
};

},{"./animatepanel":9,"./displaymetadata":10,"./dragdrop":11,"./fileupload":13,"./playsample":15,"./recordbutton":16,"./sessionpermissions":18,"./showtab":20}],15:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* global $ */
'use strict';

var utils = require('../utils');
var onFileProgress = utils.onFileProgress;
var handleFileUpload = require('../handlefileupload').handleFileUpload;
var getKeywordsToSearch = require('./displaymetadata').getKeywordsToSearch;
var showError = require('./showerror').showError;
var effects = require('./effects');

var LOOKUP_TABLE = {
  'ar-AR_BroadbandModel': ['ar-AR_Broadband_sample1.wav', 'ar-AR_Broadband_sample2.wav', 'الطقس , رياح معتدلة', 'احلامنا , نستلهم'],
  'en-UK_BroadbandModel': ['en-UK_Broadband_sample1.wav', 'en-UK_Broadband_sample2.wav', 'important industry, affordable travel, business', 'consumer, quality, best practice'],
  'en-UK_NarrowbandModel': ['en-UK_Narrowband_sample1.wav', 'en-UK_Narrowband_sample2.wav', 'heavy rain, northwest, UK', 'Watson, sources across social media'],
  'en-US_BroadbandModel': ['Us_English_Broadband_Sample_1.wav', 'Us_English_Broadband_Sample_2.wav', 'sense of pride, watson, technology, changing the world', 'round, whirling velocity, unwanted emotion'],
  'en-US_NarrowbandModel': ['Us_English_Narrowband_Sample_1.wav', 'Us_English_Narrowband_Sample_2.wav', 'course online, four hours, help', 'ibm, customer experience, media data'],
  'es-ES_BroadbandModel': ['Es_ES_spk24_16khz.wav', 'Es_ES_spk19_16khz.wav', 'quiero preguntarle, existen productos', 'preparando, regalos para la familia, sobrinos'],
  'es-ES_NarrowbandModel': ['Es_ES_spk24_8khz.wav', 'Es_ES_spk19_8khz.wav', 'QUIERO PREGUNTARLE, EXISTEN PRODUCTOS', 'PREPARANDO, REGALOS PARA LA FAMILIA, SOBRINOS'],
  'ja-JP_BroadbandModel': ['sample-Ja_JP-wide1.wav', 'sample-Ja_JP-wide2.wav', '場所 , 今日', '変更 , 給与 , コード'],
  'ja-JP_NarrowbandModel': ['sample-Ja_JP-narrow3.wav', 'sample-Ja_JP-narrow4.wav', 'お客様 , お手数', '申し込み , 今回 , 通帳'],
  'pt-BR_BroadbandModel': ['pt-BR_Sample1-16KHz.wav', 'pt-BR_Sample2-16KHz.wav', 'sistema da ibm, setor bancário, qualidade, necessidades dos clientes', 'médicos, informações, planos de tratamento'],
  'pt-BR_NarrowbandModel': ['pt-BR_Sample1-8KHz.wav', 'pt-BR_Sample2-8KHz.wav', 'cozinha, inovadoras receitas, criatividade', 'sistema, treinado por especialistas, setores diferentes'],
  'zh-CN_BroadbandModel': ['zh-CN_sample1_for_16k.wav', 'zh-CN_sample2_for_16k.wav', '沃 森 是 认知 , 大 数据 分析 能力', '技术 , 语音 , 的 用户 体验 , 人们 , 手机'],
    'zh-CN_NarrowbandModel': ['zh-CN_sample1_for_8k.wav', 'zh-CN_sample2_for_8k.wav', '公司 的 支持 , 理财 计划', '假期 , 安排'],
    'fr-FR_BroadbandModel': ['fr-FR_Broadband_sample1.wav', 'fr-FR_Broadband_sample2.wav', 'liberté d\'opinion , frontières , idées', 'loisirs , durée du travail']
};

var playSample = (function() {

  var running = false;
  localStorage.setItem('currentlyDisplaying', 'false');
  localStorage.setItem('samplePlaying', 'false');

  return function(token, imageTag, sampleNumber, iconName, url, keywords) {
    $.publish('clearscreen');

    var currentlyDisplaying = localStorage.getItem('currentlyDisplaying');
    var samplePlaying = localStorage.getItem('samplePlaying');

    if (samplePlaying === sampleNumber) {
      console.log('HARD SOCKET STOP');
      $.publish('socketstop');
      localStorage.setItem('currentlyDisplaying', 'false');
      localStorage.setItem('samplePlaying', 'false');
      effects.stopToggleImage(timer, imageTag, iconName); // eslint-disable-line no-use-before-define
      effects.restoreImage(imageTag, iconName);
      running = false;
      return;
    }

    if (currentlyDisplaying === 'record') {
      showError('Currently audio is being recorded, please stop recording before playing a sample');
      return;
    } else if (currentlyDisplaying === 'fileupload' || samplePlaying !== 'false') {
      showError('Currently another file is playing, please stop the file or wait until it finishes');
      return;
    }

    localStorage.setItem('currentlyDisplaying', 'sample');
    localStorage.setItem('samplePlaying', sampleNumber);
    running = true;

    $('#resultsText').val('');   // clear hypotheses from previous runs

    var timer = setInterval(effects.toggleImage, 750, imageTag, iconName);

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.onload = function() {
      var blob = xhr.response;
      var currentModel = localStorage.getItem('currentModel') || 'es-ES_BroadbandModel';
      var reader = new FileReader();
      var blobToText = new Blob([blob]).slice(0, 4);
      reader.readAsText(blobToText);
      reader.onload = function() {
        var contentType = reader.result === 'fLaC' ? 'audio/flac' : 'audio/wav';
        console.log('Uploading file', reader.result);
        var mediaSourceURL = URL.createObjectURL(blob);
        var audio = new Audio();
        audio.src = mediaSourceURL;
        audio.play();
        $.subscribe('hardsocketstop', function() {
          audio.pause();
          audio.currentTime = 0;
        });
        $.subscribe('socketstop', function() {
          audio.pause();
          audio.currentTime = 0;
        });

        if (getKeywordsToSearch().length == 0) {
          $('#tb_keywords').focus();
          $('#tb_keywords').val(keywords);
          $('#tb_keywords').change();
        }
        handleFileUpload('sample', token, currentModel, blob, contentType, function(socket) {
          var parseOptions = {
            file: blob
          };
          // var samplingRate = (currentModel.indexOf('Broadband') !== -1) ? 16000 : 8000;
          onFileProgress(parseOptions,
            // On data chunk
            function onData(chunk) {
              socket.send(chunk);
            },
            function isRunning() {
              if (running)
                return true;
              else
                return false;
            },
            // On file read error
            function(evt) {
              console.log('Error reading file: ', evt.message);
              // showError(evt.message);
            },
            // On load end
            function() {
              socket.send(JSON.stringify({'action': 'stop'}));
            }/* ,
            samplingRate*/
            );
        },
        // On connection end
          function() {
            effects.stopToggleImage(timer, imageTag, iconName);
            effects.restoreImage(imageTag, iconName);
            localStorage.getItem('currentlyDisplaying', 'false');
            localStorage.setItem('samplePlaying', 'false');
          }
        );
      };
    };
    xhr.send();
  };
})();

exports.initPlaySample = function(ctx) {
  var keywords1 = LOOKUP_TABLE[ctx.currentModel][2].split(',');
  var keywords2 = LOOKUP_TABLE[ctx.currentModel][3].split(',');
  var set = {};

  for (var i = keywords1.length - 1; i >= 0; --i) {
    var word = keywords1[i].trim();
    set[word] = word;
  }

  // eslint-disable-next-line no-redeclare
  for (var i = keywords2.length - 1; i >= 0; --i) {
    // eslint-disable-next-line no-redeclare
    var word = keywords2[i].trim();
    set[word] = word;
  }

  var keywords = [];
  // eslint-disable-next-line no-redeclare
  for (var word in set) { // eslint-disable-line guard-for-in
    keywords.push(set[word]);
  }
  keywords.sort();

  (function() {
    var fileName = 'audio/' + LOOKUP_TABLE[ctx.currentModel][0];
    // var keywords = LOOKUP_TABLE[ctx.currentModel][2];
    var el = $('.play-sample-1');
    el.off('click');
    var iconName = 'play';
    var imageTag = el.find('img');
    el.click(function() {
      playSample(ctx.token, imageTag, 'sample-1', iconName, fileName, keywords, function(result) {
        console.log('Play sample result', result);
      });
    });
  })(ctx, LOOKUP_TABLE);

  (function() {
    var fileName = 'audio/' + LOOKUP_TABLE[ctx.currentModel][1];
    // var keywords = LOOKUP_TABLE[ctx.currentModel][3];
    var el = $('.play-sample-2');
    el.off('click');
    var iconName = 'play';
    var imageTag = el.find('img');
    el.click(function() {
      playSample(ctx.token, imageTag, 'sample-2', iconName, fileName, keywords, function(result) {
        console.log('Play sample result', result);
      });
    });
  })(ctx, LOOKUP_TABLE);
};

},{"../handlefileupload":3,"../utils":8,"./displaymetadata":10,"./effects":12,"./showerror":19}],16:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* global $ */
'use strict';

var Microphone = require('../Microphone');
var handleMicrophone = require('../handlemicrophone').handleMicrophone;
var showError = require('./showerror').showError;

exports.initRecordButton = function(ctx) {

  var recordButton = $('#recordButton');

  recordButton.click((function() {

    var running = false;
    var token = ctx.token;
    var micOptions = {
      bufferSize: ctx.buffersize
    };
    var mic = new Microphone(micOptions);

    return function(evt) {
      // Prevent default anchor behavior
      evt.preventDefault();

      var currentModel = localStorage.getItem('currentModel');
      var currentlyDisplaying = localStorage.getItem('currentlyDisplaying');

      if (currentlyDisplaying == 'sample' || currentlyDisplaying == 'fileupload') {
        showError('Currently another file is playing, please stop the file or wait until it finishes');
        return;
      }
      localStorage.setItem('currentlyDisplaying', 'record');
      if (!running) {
        $('#resultsText').val('');   // clear hypotheses from previous runs
        console.log('Not running, handleMicrophone()');
        handleMicrophone(token, currentModel, mic, function(err) {
          if (err) {
            var msg = 'Error: ' + err.message;
            console.log(msg);
            showError(msg);
            running = false;
            localStorage.setItem('currentlyDisplaying', 'false');
          } else {
            recordButton.css('background-color', '#d74108');
            recordButton.find('img').attr('src', 'images/stop.svg');
            console.log('starting mic');
            mic.record();
            running = true;
          }
        });
      } else {
        console.log('Stopping microphone, sending stop action message');
        recordButton.removeAttr('style');
        recordButton.find('img').attr('src', 'images/microphone.svg');
        $.publish('hardsocketstop');
        mic.stop();
        running = false;
        localStorage.setItem('currentlyDisplaying', 'false');
      }
    };
  })());
};

},{"../Microphone":1,"../handlemicrophone":4,"./showerror":19}],17:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* global $ */
'use strict';

var initPlaySample = require('./playsample').initPlaySample;

exports.initSelectModel = function(ctx) {


  ctx.models.forEach(function(model) {
    $('#dropdownMenuList').append(
      $('<li>')
        .attr('role', 'presentation')
        .append(
          $('<a>').attr('role', 'menu-item')
            .attr('href', '/')
            .attr('data-model', model.name)
            .append(model.description.substring(0, model.description.length - 1), model.rate == 8000 ? ' (8KHz)' : ' (16KHz)'))
          );
  });


  $('#dropdownMenuList').click(function(evt) {
    evt.preventDefault();
    evt.stopPropagation();
    console.log('Change view', $(evt.target).text());
    var newModelDescription = $(evt.target).text();
    var newModel = $(evt.target).data('model');
    $('#dropdownMenuDefault').empty().text(newModelDescription);
    $('#dropdownMenu1').dropdown('toggle');
    localStorage.setItem('currentModel', newModel);
    ctx.currentModel = newModel;
    initPlaySample(ctx);
    $('#tb_keywords').focus();
    $('#tb_keywords').val('');
    $('#tb_keywords').change();
    $.publish('clearscreen');
  });

};

},{"./playsample":15}],18:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* global $ */
'use strict';


exports.initSessionPermissions = function() {
  console.log('Initializing session permissions handler');
  // Radio buttons
  var sessionPermissionsRadio = $('#sessionPermissionsRadioGroup input[type=\'radio\']');
  sessionPermissionsRadio.click(function() {
    var checkedValue = sessionPermissionsRadio.filter(':checked').val();
    console.log('checkedValue', checkedValue);
    localStorage.setItem('sessionPermissions', checkedValue);
  });
};

},{}],19:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* global $ */
'use strict';


exports.showError = function(msg) {
  console.log('Error: ', msg);
  var errorAlert = $('.error-row');
  errorAlert.hide();
  errorAlert.css('background-color', '#d74108');
  errorAlert.css('color', 'white');
  var errorMessage = $('#errorMessage');
  errorMessage.text(msg);
  errorAlert.show();
  $('#errorClose').click(function(e) {
    e.preventDefault();
    errorAlert.hide();
    return false;
  });
};

exports.showNotice = function(msg) {
  console.log('Notice: ', msg);
  var noticeAlert = $('.notification-row');
  noticeAlert.hide();
  noticeAlert.css('border', '2px solid #ececec');
  noticeAlert.css('background-color', '#f4f4f4');
  noticeAlert.css('color', 'black');
  var noticeMessage = $('#notificationMessage');
  noticeMessage.text(msg);
  noticeAlert.show();
  $('#notificationClose').click(function(e) {
    e.preventDefault();
    noticeAlert.hide();
    return false;
  });
};

exports.hideError = function() {
  var errorAlert = $('.error-row');
  errorAlert.hide();
};

},{}],20:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* global $ */
'use strict';

exports.initShowTab = function() {
  $('.nav-tabs a[data-toggle="tab"]').on('shown.bs.tab', function(e) {
    // show selected tab / active
    var target = $(e.target).text();
    if (target === 'JSON') {
      $.publish('showjson');
    }
  });
};

},{}]},{},[5]);
