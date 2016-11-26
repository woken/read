/**
 * [preload description]
 * @param  {[type]} url [description]
 * @return {[type]}     [description]
 */
function talk_multi(texts) {
	var list = new Array;
	var text_voice = new Array;
	var response = new Array;
	$.each(texts, function(index, text) {
		var id = utf8_to_b64(text);
		$('#tts_audio').append('<audio id="' + id + '" <source src="tts?text=' + text + '" type="audio/wav"></audio>');
		response.push({
			id: id,
			text: text
		});
	});
	return response;
}

/**
 * [preload description]
 * @param  {[type]} url [description]
 * @return {[type]}     [description]
 */
function talk(text) {
	var id = utf8_to_b64(text);
	$('#tts_audio').append('<audio id="' + id + '" <source src="tts?text=' + text + '" type="audio/wav"></audio>');
	go_text(text);
	return id;
}

function utf8_to_b64(txt) {
	return window.btoa(unescape(encodeURIComponent(txt)));
}