var resquest = callAPI('api/token', 'POST', null);
var intervalKey;
var soundController = {};
var current_document = {};

$(document).ready(function() {
    talk_me(cotorra);
});

$('#record').click(function() {
    resquest.done(function(token) {
        var wsURI = "wss://stream.watsonplatform.net/speech-to-text/api/v1/recognize?watson-token=" + token + "&model=es-ES_BroadbandModel";
        ws_socket(wsURI);
        soundController = config_media();
        soundController.startRecording();
    });
});

$('#record_stop').click(function() {
    soundController.stopRecording();
    soundController = null;
});

/**
 * [talk_me description]
 * @param  {[type]} texts [description]
 * @return {[type]}       [description]
 */
function talk_me(texts) {
    var lists = talk_multi(texts);
    var index = 0;
    var audio = document.getElementById(lists[index].id);


    go_text(lists[index].text);
    audio.play();
    audio.addEventListener('ended', myHandler, false);

    sleep(500);

    function myHandler(e) {
        index++;
        if (index < lists.length) {
            var audio = document.getElementById(lists[index].id);
            go_text(lists[index].text);
            audio.play();
            audio.addEventListener('ended', myHandler, false);

            sleep(500);

            function myHandler(e) {
                index++;
                if (index < lists.length) {
                    var audio = document.getElementById(lists[index].id);
                    go_text(lists[index].text);
                    audio.play();
                    audio.addEventListener('ended', myHandler, false);
                    sleep(500);
                }
            }
        }
    }
}

/**
 * [tell_me_the_function description]
 * @param  {[type]} texts [description]
 * @return {[type]}       [description]
 */
function tell_me_the_function(texts) {
    var text_functions = '';
    var id = null;
    $("#action a").remove();
    $("#tts_audio audio").remove();
    switch ($('#type_document').val()) {
        case 'boleta':
            talk_me(boleta);
            lists = talk_multi(texts);

            for (var i = 0; i < boleta.length; i++) {
                $('#action').append('<a href="#" class="btn btn-lg active" onclick="tell_me_the_document(' + "'" + lists[i].id + "', '" + i + "'" + ')" id ="' + i + '" alt="false">' + boleta[i + 1].toUpperCase() + '</a>');
            }
            break;
        case 'contrato':
            talk_me(contrato);
            lists = talk_multi(texts);
            for (var i = 1; i < contrato.length; i++) {
                if (typeof lists[i].id !== undefined) {
                    $('#action').append('<a href="#" class="btn btn-lg active" onclick="tell_me_the_document(' + "'" + lists[i].id + "', '" + i + "'" + ')" id ="' + i + '" alt="false">' + contrato[i + 1].toUpperCase() + '</a>');
                }
            }
            break;
    }
}

/**
 * [tell_me_the_document description]
 * @param  {[type]} id     [description]
 * @param  {[type]} tag_id [description]
 * @return {[type]}        [description]
 */
function tell_me_the_document(id, tag_id) {
    var audio = document.getElementById(id);
    var on_play = $('#' + tag_id).attr("alt");
    if (on_play == 'false') {
        $('#' + tag_id).attr("alt", "true");
        audio.play();
        audio.addEventListener('ended', myHandler, false);

        sleep(500);

        function myHandler(e) {
            console.log(id);
            $('#' + tag_id).attr("alt", "false");
        }
    } else {
        $('#' + tag_id).attr("alt", "false");
        audio.pause();
    }
}

/**
 * [go_text description]
 * @param  {[type]} text [description]
 * @return {[type]}      [description]
 */
function go_text(text) {
    $('#go_text').text(text);
}

/**
 * [sleep description]
 * @param  {[type]} milliseconds [description]
 * @return {[type]}              [description]
 */
function sleep(milliseconds) {
    var start = new Date().getTime();
    for (var i = 0; i < 1e7; i++) {
        if ((new Date().getTime() - start) > milliseconds) {
            break;
        }
    }
}

/**
 * [isObject description]
 * @param  {[type]}  val [description]
 * @return {Boolean}     [description]
 */
function isObject(val) {
    return val instanceof Object;
}