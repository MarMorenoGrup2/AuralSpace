document.getElementById('btnLoad').onclick = function() {
    const model = document.getElementById('model').files[0];
    const irs = document.getElementById('irs').files;

    if (!model || irs.length === 0) {
        alert("Si us plau, selecciona el model 3D i els fitxers d'impuls (IRs).");
        return;
    }

    // Aquí se mostraría un feedback de carga
    document.getElementById('status').style.display = 'block';
    
    // En un entorno real, aquí guardaríamos los datos o pasaríamos los blobs
    // Por ahora, simulamos el proceso y volvemos a la principal
    setTimeout(() => {
        alert("Configuració realitzada. Tornant al visor 3D...");
        window.location.href = 'index.html';
    }, 1500);
};