(() => {
  function setReactSelectValue(select, value) {
    if (!select || select.value === value) return
    const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
    descriptor?.set?.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function fieldLabel(input) {
    const wrap = input.closest('div')
    return String(wrap?.querySelector('label')?.textContent || '').trim().toLowerCase()
  }

  function selectedStaffSection(input) {
    let node = input.parentElement
    while (node && node !== document.body) {
      const heading = node.querySelector(':scope > h2')
      if (String(heading?.textContent || '').trim() === 'Edit Selected Staff') return node
      node = node.parentElement
    }
    return input.closest('.section')
  }

  function apply(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== 'time') return
    if (!input.value) return

    const label = fieldLabel(input)
    const section = selectedStaffSection(input)
    if (!section) return

    const statusSelect = Array.from(section.querySelectorAll('select')).find((select) =>
      Array.from(select.options || []).some((option) => option.value === 'Present') &&
      Array.from(select.options || []).some((option) => option.value === 'PTO')
    )
    if (!statusSelect) return

    if (label === 'clock in') setReactSelectValue(statusSelect, 'Present')
    if (label === 'clock out') setReactSelectValue(statusSelect, 'PTO')
  }

  document.addEventListener('change', (event) => apply(event.target), true)
  document.addEventListener('input', (event) => apply(event.target), true)
})()
