(() => {
  const removeChild = Node.prototype.removeChild
  const insertBefore = Node.prototype.insertBefore

  Node.prototype.removeChild = function safeRemoveChild(child) {
    if (child && child.parentNode === this) return removeChild.call(this, child)
    return child
  }

  Node.prototype.insertBefore = function safeInsertBefore(newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) return this.appendChild(newNode)
    return insertBefore.call(this, newNode, referenceNode)
  }
})()
