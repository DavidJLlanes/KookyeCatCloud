'use strict';
/* Tamaño del texto: un único factor (--fs) que multiplica todas las tipografías. Se guarda en este dispositivo. */
(function () {
  const KEY = 'kcc-fs'; const MIN = 85, MAX = 140, PASO = 5;
  const lee = () => { try { const v = Number(localStorage.getItem(KEY)); return v >= MIN && v <= MAX ? v : 100; } catch { return 100; } };
  const aplica = (v, guarda) => { document.documentElement.style.setProperty('--fs', String(v / 100)); if (guarda) { try { localStorage.setItem(KEY, String(v)); } catch { /* sin almacenamiento */ } } };
  aplica(lee(), false);
  function monta() {
    const box = document.getElementById('fs-ctl'); if (!box || box.childElementCount) return;
    let v = lee();
    const fila = document.createElement('div'); fila.className = 'fs-row';
    const menos = document.createElement('button'); menos.type = 'button'; menos.className = 'btn fs-btn'; menos.textContent = 'A−'; menos.setAttribute('aria-label', 'Reducir texto');
    const mas = document.createElement('button'); mas.type = 'button'; mas.className = 'btn fs-btn'; mas.textContent = 'A+'; mas.setAttribute('aria-label', 'Aumentar texto');
    const rng = document.createElement('input'); rng.type = 'range'; rng.min = String(MIN); rng.max = String(MAX); rng.step = String(PASO); rng.value = String(v); rng.setAttribute('aria-label', 'Tamaño del texto');
    const num = document.createElement('output'); num.className = 'fs-num';
    const rest = document.createElement('button'); rest.type = 'button'; rest.className = 'btn fs-btn'; rest.textContent = 'Restablecer';
    const muestra = document.createElement('p'); muestra.className = 'fs-muestra'; muestra.textContent = 'Así se verá el texto de la aplicación.';
    const pon = (n, g) => { v = Math.max(MIN, Math.min(MAX, n)); rng.value = String(v); num.textContent = v + ' %'; aplica(v, g); };
    rng.addEventListener('input', () => pon(+rng.value, true));
    menos.addEventListener('click', () => pon(v - PASO, true)); mas.addEventListener('click', () => pon(v + PASO, true)); rest.addEventListener('click', () => pon(100, true));
    pon(v, false);
    fila.append(menos, rng, mas, num, rest); box.append(fila, muestra);
  }
  window.KccTextSize = { monta };
  document.addEventListener('DOMContentLoaded', monta);
})();
