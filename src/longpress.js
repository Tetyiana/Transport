// Довге натискання (~0.6с) на рядку — для редагування з мобільного.
export const longPress = (cb, ms = 600) => {
  let t = null
  const clear = () => { if (t) { clearTimeout(t); t = null } }
  return {
    className: 'pressable',
    onTouchStart: () => { clear(); t = setTimeout(() => { t = null; cb() }, ms) },
    onTouchEnd: clear,
    onTouchMove: clear,
    onTouchCancel: clear,
    onContextMenu: (e) => e.preventDefault(),
  }
}
