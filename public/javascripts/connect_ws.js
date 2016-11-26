var audioContext = window.AudioContext || window.webkitAudioContext;
var context = new audioContext();

function ws_socket(wsURI) {
    socket = new window.SocketWrapper({
        url: wsURI,
        onopen: function() {},
        onmessage: function() {
            if (arguments != "") {
                if (arguments[0].isTrusted && arguments[0].state == 'listening') {
                    console.log(arguments[0].data);
                } else {
                    var data = JSON.parse(arguments[0].data);
                    var flag = false;
                    if (typeof data.results !== undefined) {
                        $.each(data.results[0].alternatives, function(index, values) {
                            var transcript = values.transcript;
                            console.log(transcript);
                            if (!flag) {
                                $.each($("#action").find("a").toArray(), function(index, value) {
                                    if ($(value).text().search(new RegExp(transcript, 'ig')) != -1 && transcript.length >= 3 && !flag) {
                                        var codeToExecute = $(value).attr('onClick');
                                        var tmpFunc = new Function(codeToExecute);
                                        tmpFunc();
                                        flag = true;
                                        console.log(transcript);
                                    }
                                });
                            }
                        });
                    }

                }
            } else {
                console.error(arguments[0].data);
            }
        },
        onclose: function() {
            //socket = null;
        },
        onerror: function() {
            console.log('error occured, oh no!');
            console.error(arguments);
        }
    });
}

function config_media() {
    var soundController = {};
    soundController.recording = false;

    soundController.device = navigator.webkitGetUserMedia({
        audio: true,
        video: false
    }, function(stream) {
        var audioInput = context.createMediaStreamSource(stream);
        var bufferSize = 2048;
        // create a javascript node
        soundController.recorder = context.createScriptProcessor(bufferSize, 1, 1);
        // specify the processing function
        soundController.recorder.onaudioprocess = soundController.recorderProcess;
        // connect stream to our recorder
        audioInput.connect(soundController.recorder);
        // connect our recorder to the previous destination
        soundController.recorder.connect(context.destination);
    }, function(err) {
        console.log("The following error occured: " + err.name);
    });


    function convertFloat32ToInt16(buffer) {
        var l = buffer.length;
        var point = Math.floor(l / 3);
        var buf = new Int16Array(point);
        for (var x = l; x > 0;) {
            var average = (buffer[x] + buffer[x - 1] + buffer[x - 2]) / 3;
            buf[point] = average * 0x7FFF;
            point -= 1;
            x -= 3;
        }
        return buf.buffer;
    }

    soundController.recorderProcess = function(e) {
        var left = e.inputBuffer.getChannelData(0);
        if (soundController.recording === true) {
            var chunk = convertFloat32ToInt16(left);
            socket.send(chunk);
        } else {
            chunk = null;
        }
    };

    soundController.startRecording = function() {

        if (soundController.recording === false) {
            console.log('>>> Start Recording');
            soundController.recording = true;
            var message = {
                'action': 'start',
                'content-type': 'audio/l16;rate=22050',
                'keywords': ['CONDICIONES CONTRACTUALES',
                    'DESCRIPCIÓN DEL SERVICIO',
                    'PRECIO DEL SERVICIO',
                    'PAGO DEL SERVICIO',
                    'CONTROL DE GASTO',
                    'TERMINACIÓN DEL CONTRATO',
                    'DATOS PERSONALES',
                    'VIGENCIA DEL CONTRATO',
                    'SERVICIOS',
                    'INFORMACION A CLIENTES',
                    'TOTAL A PAGAR',
                    'Fecha de Vencimiento',
                    'FECHA DE EMISIÓN',
                    'ÚLTIMO PAGO',
                    'CARGOS DEL PERIODO',
                    'Datos del cliente',
                    'Correo Electrónico'
                ],
                'keywords_threshold': 0.2,
                'word_alternatives_threshold': 0.2,
                'max_alternatives': 5
            }
            socket.send(JSON.stringify(message));
            soundController.recording = true;
        }

    };

    soundController.stopRecording = function() {

        if (soundController.recording === true) {
            console.log('||| Stop Recording');

            soundController.recording = false;

            //close binary stream
            //            soundController.stream.end();
            message = {
                "action": "stop"
            };
            socket.send(JSON.stringify(message));
        }
    };
    return soundController;
}