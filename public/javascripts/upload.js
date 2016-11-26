var type_document = null;

/**
 * Method that file upload
 * @param  {FormData} ){var file          [description]
 * @return void
 */
$('#upload_pdf').click(function() {
  var file = new FormData();
  file.append('pdf', $('input[type=file]')[0].files[0]);
  file.append('type_document', $('#type_document').val());
  if ($('#type_document').val() != "") {
    $('#loading').show();
    var resquest = callAPI('load-pdf', 'POST', file);
    $('#object_pdf_file').remove();
    resquest.done(function(response) {
      if (response.status) {
        var object = '<object id="object_pdf_file" type="application/pdf" data="' + response.data.file + '#toolbar=1&amp;navpanes=0&amp;scrollbar=1" width="100%" height="400px" internalinstanceid="10" title="">' +
          '<param name="src" value="' + response.data.file + '#toolbar=1&amp;navpanes=0&amp;scrollbar=1">' +
          '<p style="text-align:center; width: 60%;">Adobe Reader no se encuentra o la versión no es compatible, utiliza el icono para ir a la página de descarga <br>' +
          '<a href="http://get.adobe.com/es/reader/"></a></p></object>';
        $('#object_pdf').html(object);
        $('#loading').hide();
        tell_me_the_function(response.data.text);
      } else {
        alert(response.message);
      }
    });
  } else {
    alert('Debe seleccionar un tipo de documento.');
  }

});

/*
 * @param  {[type]} url    [description]
 * @param  {[type]} method [description]
 * @param  {[type]} data   [description]
 * @return {[Object]}   [description]
 */
function callAPI(url, method, data) {
  $.ajaxSetup({
    method: method,
    processData: method == 'GET' ? true : false,
    data: data,
    cache: false,
    contentType: false,
    headers: {
      'content-type': undefined
    }
  });
  return $.ajax(url);
}