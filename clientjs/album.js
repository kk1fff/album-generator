function isScrolledIntoView(elem) {
  var docViewTop = $(window).scrollTop();
  var docViewBottom = docViewTop + $(window).height();

  var elemTop = $(elem).offset().top;
  var elemBottom = elemTop + $(elem).height();
  return (((elemTop < docViewBottom) && (elemTop >= docViewTop)) ||
          ((elemBottom >= docViewBottom) && (elemBottom < docViewTop)));
}

var pendingImageContainers = [];

function initPendingImageContainers() {
  var sel = $('.image-container[img]');
  sel.each(function() {
    pendingImageContainers.push(this);
  });
}

function loadImageForShownContainer() {
  var i, stillPending = [];
  for (i = 0; i < pendingImageContainers.length; i++) {
    var element = pendingImageContainers[i];
    if (isScrolledIntoView(element)) {
      var imgelement = document.createElement('img');
      var img = $(element).attr('img');
      $(element).removeAttr('img');
      $(imgelement).attr('src', img);
      $(element).append(imgelement);
    } else {
      stillPending.push(element);
    }
  };
  pendingImageContainers = stillPending;
  if (stillPending.length == 0) {
    window.removeEventListener('scroll', loadImageForShownContainer);
  }
}

window.addEventListener('load', function() {
  $('.image-link').on('click', function(evt) {
    location.href = $(evt.delegateTarget).attr('to');
  });
  initPendingImageContainers();
  loadImageForShownContainer();
});

window.addEventListener('scroll', loadImageForShownContainer);
