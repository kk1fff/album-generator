window.addEventListener('load', function() {
  $('.album-list-item').on('click', function(evt) {
    location.href = $(evt.delegateTarget).attr('to');
  });
});
