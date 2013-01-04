window.addEventListener('load', function() {
  $('.image-link').on('click', function(evt) {
    location.href = $(evt.delegateTarget).attr('to');
  });
});
