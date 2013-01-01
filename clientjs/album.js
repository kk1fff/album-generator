window.addEventListener('load', function() {
  $('.row-list-item').on('click', function(evt) {
    location.href = $(evt.delegateTarget).attr('to');
  });
});
