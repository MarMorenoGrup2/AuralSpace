document.getElementById('btnLoad').onclick = function () {
    const model = document.getElementById('model').files[0];

    if (!model) {
        alert("Upload a GLB model.");
        return;
    }

    if (!model.name.toLowerCase().endsWith('.glb')) {
        alert("The model must be .GLB");
        return;
    }

    const status = document.getElementById('status');
    status.style.display = 'block';
    status.innerHTML = `Model loaded: ${model.name}<br>`;

    const modelURL = URL.createObjectURL(model);
    sessionStorage.setItem('modelURL', modelURL);

    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
};

function updateFileName() {
    const input = document.getElementById('model');
    const fileNameSpan = document.getElementById('file-name');
    
    if (input.files.length > 0) {
        fileNameSpan.textContent = `Added file: ${input.files[0].name}`;
    } else {
        fileNameSpan.textContent = "";
    }
}