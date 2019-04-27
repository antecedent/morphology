const challenge = document.querySelector('.challenge');
let dragging = null;

const key = {
    "edible/?": "Neužpildėte pirmojo tarpo.",
    "edible/unless": "Tokia konstrukcija kaip <code>unless</code> neegzistuoja, tačiau šiai prasmei perteikti galima rašyti <code>if not</code>.",
    "edible/depending_on": "Tokia konstrukcija kaip <code>depending_on</code> neegzistuoja. Tai galėtų būti <code>if</code> sinonimas, tačiau programavimo kalbose sinonimai labai retai leidžiami apskritai.",
};

for (var element of document.querySelectorAll('[draggable=true]')) {
    element.ondragstart = function(event) {
        dragging = event.target;
    };
}

document.querySelector('body').ondragover = function(event) {
    event.preventDefault();
};

document.querySelector('body').ondrop = function(event) {
    event.preventDefault();
    if (dragging !== null && dragging.parentElement.className.includes('challenge')) {
        dragging.innerHTML = '?';
        dragging.className = 'gap';
        dragging.draggable = false;
    }
    dragging = null;
};

for (const gap of document.querySelectorAll('.gap')) {
    gap.ondrop = function(event) {
        event.preventDefault();
        if (dragging !== null) {
            gap.innerHTML = dragging.innerHTML;
            gap.className = 'filler';
            gap.draggable = true;
            gap.ondragstart = function(event) {
                dragging = event.target;
            };
        }
        dragging = null;
    };
}

const feedback = document.querySelector('#feedback');

for (let button of document.querySelectorAll('.continue.button')) {
    button.onclick = function(event) {
        event.preventDefault();
        let correct = true;
        for (const gap of document.querySelectorAll('.task.active .challenge [data-gap]')) {
            const answer = gap.dataset.gap + '/' + gap.innerText;
            if (key.hasOwnProperty(answer)) {
                feedback.innerHTML = key[answer];
                correct = false;
                break;
            }
        }
        if (correct) {
            const task = document.querySelector('.task.active');
            task.className = task.className.replace(/active/, '');
            if (task.nextSibling.nextSibling.className === 'task') {
                task.nextSibling.nextSibling.className += ' active';
            }
            const bubble = document.querySelector('.task-bubble.active');
            bubble.className = bubble.className.replace(/active/, 'completed');
            if (bubble.nextSibling.nextSibling.className === 'task-bubble') {
                bubble.nextSibling.nextSibling.className += ' active';
            }
            feedback.className = 'positive';
            const phrases = ["Iš tiesų!", "Teisingai!", "Jums puikiai sekasi!", "Be abejo!"];
            feedback.innerHTML = phrases[Math.floor(Math.random() * phrases.length)];
        } else {
            feedback.className = 'negative';
        }
    };
}
