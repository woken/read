var express = require('express');
var pdftext = require('pdf-textstring');
var isObject = require('isobject');
var multiparty = require('multiparty');
var router = express.Router();
var fs = require('fs');
var request = require('request');
var watson = require('watson-developer-cloud');
var S = require('string');
var debug = require('debug')('read-document:router');
var boleta = {};
var contrato = {};
var extend = require('util')._extend;
var vcapServices = require('vcap_services');
var expressBrowserify = require('express-browserify');
var csrf = require('csurf')

var config_speech_to_text = extend({
  version: 'v1',
  url: 'https://stream.watsonplatform.net/speech-to-text/api',
  username: '6b1a9a7c-00dc-4bfa-8827-51c57891c8e8',
  password: 'LvE8SCPAvUqg'
}, vcapServices.getCredentials('speech_to_text'));

var authService = watson.authorization(config_speech_to_text);

/* GET home page. */
router.get('/', function(req, res, next) {
  debug(req._csrfToken);
  res.render('index', {
    title: 'Express',
    ct: req._csrfToken
  });
});

/* GET home page. */
router.get('/dos', function(req, res, next) {
  debug(req._csrfToken);
  res.render('index2', {
    title: 'Express',
    ct: req._csrfToken
  });
});

/*router.get('/js/index.js', expressBrowserify('src/index.js', {
  watch: process.env.NODE_ENV !== 'production'
}));*/

/**
 * [description]
 * @param  {[type]} ){} [description]
 * @return {[type]}       [description]
 */
router.get('/tts', function(req, res, next) {
  var response = {
    status: false,
    code: 500,
    message: ''
  };

  var text = req.query.text

  if (text != "") {
    var text_to_speech = watson.text_to_speech({
      username: '9d6abbe0-dc0f-4a63-b535-ae13cd0acdb8',
      password: 'xTaVQCGNjXC6',
      version: 'v1'
    });

    var params = {
      text: text,
      voice: 'es-ES_LauraVoice', // Optional voice
      accept: 'audio/wav'
    };

    res.status(response.code, {
      'Content-Type': 'audio/mpeg'
    });
    text_to_speech.synthesize(params).pipe(res);
  } else {
    response.message = "The text is null";
    res.status(response.code).json(response);
  }
});

router.post('/load-pdf', function(req, res, next) {
  var form = new multiparty.Form();
  var response = {
    status: true,
    code: 200,
    message: ''
  };
  var text = '';

  form.parse(req, function(err, fields, files) {
    try {
      if (isObject(files) && fields.type_document[0] != "") {
        if (files.pdf[0].originalFilename.substr(-3, 3).toLowerCase() === 'pdf') {
          pdftext.pdftotext(files.pdf[0].path, function(err, data) {
            if (err) {
              debug(err);
            } else {
              if (fields.type_document[0] == 'contrato') {
                text = data.split(/DESCRIPCIÓN DEL SERVICIO(.*)|PRECIO DEL SERVICIO(.*)|PAGO DEL SERVICIO(.*)|CONTROL DE GASTO(.*)|TERMINACIÓN DEL CONTRATO(.*)|DATOS PERSONALES(.*)|VIGENCIA DEL CONTRATO(.*)|SERVICIOS(.*)|INFORMACION A CLIENTES(.*)/);
                text = text.filter(function(n) {
                  return n != undefined
                });
                text = text.filter(function(n) {
                  return n != ''
                });
              }

              if (fields.type_document[0] == 'boleta') {
                text = new Array;
                var cliente = '';
                text.push(data.match(/TOTAL A PAGAR(.*)/g).pop().replace(':', '').replace(/\s\s+/g, ' '));
                text.push(data.match(/Fecha de Vencimiento(.*)/g).pop().replace(':', '').replace(/\s\s+/g, ' '));
                text.push(data.match(/FECHA DE EMISIÓN.*:(.*)(\d*)\-\w*\-(\d*)/g).pop().replace(':', '').replace(/ÚLTIMO PAGO:(.*)/, '').replace(/\s\s+/g, ' '));
                text.push(data.match(/ÚLTIMO PAGO:(.*)\n.*/g).pop().replace(':', ' ').replace(/\s\s+/g, ' ').replace(/\$/g, ''));
                text.push(data.match(/CARGOS DEL PERIODO(.*)/g).pop().replace(':', '').replace(/\s\s+/g, ' '));
                cliente +=data.match(/Cliente\s+\:(.*)\w/g).pop().replace('BOLETA ELECTRONICA', '').replace(':', '')+ '\n';
                cliente +=data.match(/RUT(.*)/g).pop().replace(':', '')+ '\n';
                cliente +=data.match(/Giro(.*)/g).pop().replace(':', '')+ '\n';
                cliente +=data.match(/Código Cliente(.*)/g).pop().replace(':', '')+ '\n';
                cliente +=data.match(/Dirección(.*)/g).pop().replace(':', '')+ '\n';
                cliente +=data.match(/Comuna \- Ciudad (.*)/g).pop().replace(':', '')+ '\n';
                cliente +=data.match(/Dirección Postal(.*)/g).pop().replace(':', '')+ '\n';
                cliente +=data.match(/Nº Celular(.*)\s+\:\s*[0-9]{9,9}/g).pop().replace(':', '')+ '\n';
                text.push(cliente.replace(/\s\s+/g, ' '));
                text.push('Correo Electrónico ' + data.match(/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{3,3}/g).pop());
                debug(text);
              }

              response.status = true;
              response.code = 200;
              fs.renameSync(files.pdf[0].path, './public/pdf/' + files.pdf[0].originalFilename);
              response.data = {
                name: files.pdf[0].originalFilename,
                type: files.pdf[0].originalFilename.substr(-3, 3).toLowerCase(),
                file: '/pdf/' + files.pdf[0].originalFilename,
                text: text
              };
              res.status(response.code).json(response);
            }
          });
        } else {
          response.status = false;
          response.code = 500;
          response.message = 'The file is not a PDF document';
          res.status(response.code).json(response);
        }
      } else {
        response.status = false;
        response.code = 500;
        response.message = 'Not is object';
        res.status(response.code).json(response);
      }
    } catch (e) {
      response.status = false;
      response.code = 500;
      response.message = e.message;
    }
  });
});

// Get token using your credentials
router.post('/api/token', function(req, res, next) {
  authService.getToken({
    url: config_speech_to_text.url
  }, function(err, token) {
    if (err)
      next(err);
    else
      res.send(token);
  });
});

module.exports = router;