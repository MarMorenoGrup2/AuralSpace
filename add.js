document.getElementById('btnLoad').onclick = function () {

    const model = document.getElementById('model').files[0];
    const irs = document.getElementById('irs').files;

    // =========================
    // VALIDATION
    // =========================

    if (!model) {
        alert("Upload a GLB model.");
        return;
    }

    if (irs.length === 0) {
        alert("Upload IR files.");
        return;
    }

    // =========================
    // CHECK MODEL FORMAT
    // =========================

    if (!model.name.toLowerCase().endsWith('.glb')) {
        alert("The model must be .GLB");
        return;
    }

    // =========================
    // CHECK WAV FILES
    // =========================

    for (let file of irs) {

        if (!file.name.toLowerCase().endsWith('.wav')) {

            alert(`Invalid file: ${file.name}`);
            return;
        }
    }

    // =========================
    // SHOW STATUS
    // =========================

    const status = document.getElementById('status');

    status.style.display = 'block';

    status.innerHTML = `
        ✅ Model loaded: ${model.name}<br>
        ✅ IR files loaded: ${irs.length}
    `;

    // =========================
    // CREATE TEMP URLS
    // =========================

    const modelURL = URL.createObjectURL(model);

    const irURLs = [];

    for (let file of irs) {

        irURLs.push({
            name: file.name,
            url: URL.createObjectURL(file)
        });

    }

    // =========================
    // SAVE DATA
    // =========================

    sessionStorage.setItem('modelURL', modelURL);
    sessionStorage.setItem('irURLs', JSON.stringify(irURLs));

    // =========================
    // REDIRECT
    // =========================

    setTimeout(() => {

        window.location.href = 'index.html';

    }, 1000);

};