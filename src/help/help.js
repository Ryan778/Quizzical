const appData = {
  el: '#app', 
  data: {
    showDetails: false, 
    subject: '',
    details: '' 
  }, 
  mounted: function () {
    Array.from(document.getElementsByTagName('a')).forEach(element => {
      element.addEventListener('click', function() {
        app.showDetails = true; 
        app.subject = element.innerText;
        app.details = element.dataset.content;
      })
    });
  }
};

const app = new Vue(appData); 