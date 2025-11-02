globalThis.electron.ipcRenderer.on('sources-list', (sources) => {
  const container = document.getElementById('sources-container');
  container.innerHTML = '';
  for (const source of sources) {
    const div = document.createElement('div');
    div.className = 'source';
    div.onclick = () => {
      globalThis.electron.ipcRenderer.send('source-selected', source);
    };

    const img = document.createElement('img');
    img.src = source.thumbnail.toDataURL();
    div.appendChild(img);

    const p = document.createElement('p');
    p.innerText = source.name;
    div.appendChild(p);

    container.appendChild(div);
  }
});
