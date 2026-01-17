(function() {
  // Prevent multiple instances
  if (window.__annotatorActive) {
    console.log('Annotator already active');
    return;
  }
  window.__annotatorActive = true;

  // State
  const shapes = [];
  let currentTool = 'rect';
  let currentColor = '#ffffff';
  let isDrawing = false;
  let startX, startY;
  let freehandPoints = [];
  let selectedShapeIndex = null;

  // Preset colors
  const presetColors = ['#ffffff', '#ff0000', '#00ff00', '#ffff00', '#00bfff'];

  // Create overlay canvas
  const canvas = document.createElement('canvas');
  canvas.id = 'annotator-canvas';
  canvas.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 999998;
    cursor: crosshair;
    pointer-events: auto;
  `;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Create toolbar
  const toolbar = document.createElement('div');
  toolbar.id = 'annotator-toolbar';
  toolbar.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 999999;
    background: #1a1a2e;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    gap: 8px;
    align-items: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    user-select: none;
  `;

  // Drag handle
  const dragHandle = document.createElement('div');
  dragHandle.style.cssText = `
    cursor: grab;
    padding: 4px 6px;
    margin-right: 4px;
    color: #666;
    font-size: 16px;
    display: flex;
    align-items: center;
  `;
  dragHandle.innerHTML = '⋮⋮';
  dragHandle.title = 'Drag to move toolbar';
  toolbar.appendChild(dragHandle);

  // Toolbar dragging logic
  let isDraggingToolbar = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  dragHandle.onmousedown = (e) => {
    isDraggingToolbar = true;
    dragHandle.style.cursor = 'grabbing';
    const rect = toolbar.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    // Clear right positioning when starting to drag
    toolbar.style.right = 'auto';
    e.preventDefault();
  };

  document.addEventListener('mousemove', (e) => {
    if (!isDraggingToolbar) return;
    let newX = e.clientX - dragOffsetX;
    let newY = e.clientY - dragOffsetY;
    // Keep toolbar on screen
    newX = Math.max(0, Math.min(newX, window.innerWidth - toolbar.offsetWidth));
    newY = Math.max(0, Math.min(newY, window.innerHeight - toolbar.offsetHeight));
    toolbar.style.left = newX + 'px';
    toolbar.style.top = newY + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isDraggingToolbar) {
      isDraggingToolbar = false;
      dragHandle.style.cursor = 'grab';
    }
  });

  const buttonStyle = `
    padding: 8px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
    background: #16213e;
    color: #e0e0e0;
  `;

  const activeButtonStyle = `
    background: #e94560;
    color: white;
  `;

  // Tool buttons (removed circle)
  const tools = [
    { id: 'rect', label: '&#9633; Rect', title: 'Draw rectangles' },
    { id: 'freehand', label: '&#9998; Draw', title: 'Freehand drawing' }
  ];

  const toolButtons = {};
  tools.forEach(tool => {
    const btn = document.createElement('button');
    btn.innerHTML = tool.label;
    btn.title = tool.title;
    btn.style.cssText = buttonStyle + (tool.id === currentTool ? activeButtonStyle : '');
    btn.onclick = () => selectTool(tool.id);
    toolButtons[tool.id] = btn;
    toolbar.appendChild(btn);
  });

  // Separator
  const sep1 = document.createElement('div');
  sep1.style.cssText = 'width: 1px; height: 24px; background: #333;';
  toolbar.appendChild(sep1);

  // Color preset boxes
  const colorBoxes = [];
  presetColors.forEach((color, index) => {
    const box = document.createElement('div');
    box.style.cssText = `
      width: 28px;
      height: 28px;
      background: ${color};
      border-radius: 4px;
      cursor: pointer;
      border: 2px solid ${index === 0 ? '#e94560' : '#333'};
      transition: border-color 0.2s;
    `;
    box.title = `Color: ${color}`;
    box.onclick = () => selectColor(color, index);
    colorBoxes.push(box);
    toolbar.appendChild(box);
  });

  // Color picker for custom colors
  const colorPicker = document.createElement('input');
  colorPicker.type = 'color';
  colorPicker.value = currentColor;
  colorPicker.title = 'Custom color';
  colorPicker.style.cssText = `
    width: 28px;
    height: 28px;
    border: 2px solid #333;
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
    padding: 0;
  `;
  colorPicker.onchange = (e) => {
    currentColor = e.target.value;
    // Deselect all preset boxes
    colorBoxes.forEach(box => box.style.borderColor = '#333');
    colorPicker.style.borderColor = '#e94560';
  };
  toolbar.appendChild(colorPicker);

  function selectColor(color, index) {
    currentColor = color;
    colorBoxes.forEach((box, i) => {
      box.style.borderColor = i === index ? '#e94560' : '#333';
    });
    colorPicker.style.borderColor = '#333';
  }

  // Separator
  const sep2 = document.createElement('div');
  sep2.style.cssText = 'width: 1px; height: 24px; background: #333;';
  toolbar.appendChild(sep2);

  // Undo button
  const undoBtn = document.createElement('button');
  undoBtn.innerHTML = '&#8630; Undo';
  undoBtn.title = 'Remove last annotation';
  undoBtn.style.cssText = buttonStyle;
  undoBtn.onclick = () => {
    if (shapes.length > 0) {
      shapes.pop();
      redraw();
    }
  };
  toolbar.appendChild(undoBtn);

  // Clear button
  const clearBtn = document.createElement('button');
  clearBtn.innerHTML = '&#10006; Clear';
  clearBtn.title = 'Clear all annotations';
  clearBtn.style.cssText = buttonStyle;
  clearBtn.onclick = () => {
    shapes.length = 0;
    redraw();
  };
  toolbar.appendChild(clearBtn);

  // Separator
  const sep3 = document.createElement('div');
  sep3.style.cssText = 'width: 1px; height: 24px; background: #333;';
  toolbar.appendChild(sep3);

  // Toggle notes visibility button
  let notesVisible = true;
  const toggleNotesBtn = document.createElement('button');
  toggleNotesBtn.innerHTML = '👁 Notes';
  toggleNotesBtn.title = 'Show/hide all notes';
  toggleNotesBtn.style.cssText = buttonStyle + activeButtonStyle;
  toggleNotesBtn.onclick = () => {
    notesVisible = !notesVisible;
    toggleNotesBtn.innerHTML = notesVisible ? '👁 Notes' : '🙈 Notes';
    toggleNotesBtn.style.cssText = buttonStyle + (notesVisible ? activeButtonStyle : '');
    redraw();
  };
  toolbar.appendChild(toggleNotesBtn);

  // Separator
  const sep3b = document.createElement('div');
  sep3b.style.cssText = 'width: 1px; height: 24px; background: #333;';
  toolbar.appendChild(sep3b);

  // Copy Text button
  const copyBtn = document.createElement('button');
  copyBtn.innerHTML = '&#128203; Copy Text';
  copyBtn.title = 'Copy annotations as text';
  copyBtn.style.cssText = buttonStyle + 'background: #0f3460;';
  copyBtn.onclick = copyAnnotationsText;
  toolbar.appendChild(copyBtn);

  // Separator
  const sep4 = document.createElement('div');
  sep4.style.cssText = 'width: 1px; height: 24px; background: #333;';
  toolbar.appendChild(sep4);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&#10005; Close';
  closeBtn.title = 'Exit annotator';
  closeBtn.style.cssText = buttonStyle + 'background: #e94560;';
  closeBtn.onclick = cleanup;
  toolbar.appendChild(closeBtn);

  document.body.appendChild(toolbar);

  // Note input popup
  const notePopup = document.createElement('div');
  notePopup.id = 'annotator-note-popup';
  notePopup.style.cssText = `
    position: fixed;
    display: none;
    z-index: 1000000;
    background: #1a1a2e;
    border-radius: 8px;
    padding: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  notePopup.innerHTML = `
    <div style="color: #e0e0e0; margin-bottom: 8px; font-size: 13px;">Add note for annotation <span id="annotator-note-number"></span>:</div>
    <textarea id="annotator-note-input" style="
      width: 250px;
      height: 60px;
      border: 1px solid #333;
      border-radius: 4px;
      padding: 8px;
      font-size: 13px;
      resize: none;
      background: #16213e;
      color: #e0e0e0;
    " placeholder="Enter your note here..."></textarea>
    <div style="margin-top: 8px; display: flex; gap: 8px; justify-content: space-between;">
      <button id="annotator-note-delete" style="${buttonStyle} background: #8b0000; color: white;">Delete</button>
      <div style="display: flex; gap: 8px;">
        <button id="annotator-note-cancel" style="${buttonStyle}">Cancel</button>
        <button id="annotator-note-save" style="${buttonStyle} background: #e94560; color: white;">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(notePopup);

  const noteInput = document.getElementById('annotator-note-input');
  const noteNumber = document.getElementById('annotator-note-number');

  document.getElementById('annotator-note-delete').onclick = () => {
    if (selectedShapeIndex !== null && shapes[selectedShapeIndex]) {
      shapes.splice(selectedShapeIndex, 1);
      redraw();
    }
    notePopup.style.display = 'none';
    selectedShapeIndex = null;
  };

  document.getElementById('annotator-note-cancel').onclick = () => {
    notePopup.style.display = 'none';
    selectedShapeIndex = null;
  };

  document.getElementById('annotator-note-save').onclick = () => {
    if (selectedShapeIndex !== null && shapes[selectedShapeIndex]) {
      shapes[selectedShapeIndex].note = noteInput.value;
      redraw();
    }
    notePopup.style.display = 'none';
    selectedShapeIndex = null;
  };

  // Tool selection
  function selectTool(toolId) {
    currentTool = toolId;
    Object.keys(toolButtons).forEach(id => {
      toolButtons[id].style.cssText = buttonStyle + (id === toolId ? activeButtonStyle : '');
    });
  }

  // Show note popup for a shape
  function showNotePopup(shapeIndex, x, y) {
    selectedShapeIndex = shapeIndex;
    noteInput.value = shapes[shapeIndex].note || '';
    noteNumber.textContent = `#${shapeIndex + 1}`;

    // Position popup, keeping it on screen
    let popupX = x + 10;
    let popupY = y + 10;
    if (popupX + 280 > window.innerWidth) popupX = window.innerWidth - 290;
    if (popupY + 150 > window.innerHeight) popupY = window.innerHeight - 160;

    notePopup.style.left = popupX + 'px';
    notePopup.style.top = popupY + 'px';
    notePopup.style.display = 'block';
    noteInput.focus();
  }

  // Drawing functions
  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    shapes.forEach((shape, index) => {
      drawShape(shape, index);
    });
  }

  function drawShape(shape, index) {
    // Convert page coordinates to viewport coordinates
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    ctx.strokeStyle = shape.color;
    ctx.lineWidth = 3;
    ctx.fillStyle = shape.color + '20';

    if (shape.type === 'rect') {
      // Convert page coords to viewport coords
      const viewX = shape.pageX - scrollX;
      const viewY = shape.pageY - scrollY;

      // Skip if completely off-screen
      if (viewX + shape.width < 0 || viewX > canvas.width ||
          viewY + shape.height < 0 || viewY > canvas.height) {
        return;
      }

      ctx.beginPath();
      ctx.rect(viewX, viewY, shape.width, shape.height);
      ctx.fill();
      ctx.stroke();
    } else if (shape.type === 'freehand') {
      if (shape.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(shape.points[0].x - scrollX, shape.points[0].y - scrollY);
        for (let i = 1; i < shape.points.length; i++) {
          ctx.lineTo(shape.points[i].x - scrollX, shape.points[i].y - scrollY);
        }
        ctx.stroke();
      }
    }

    // Draw index badge
    const badgePos = getShapeBadgePosition(shape);
    const badgeViewX = badgePos.x - scrollX;
    const badgeViewY = badgePos.y - scrollY;

    ctx.fillStyle = shape.color;
    ctx.beginPath();
    ctx.arc(badgeViewX, badgeViewY, 12, 0, Math.PI * 2);
    ctx.fill();

    // Badge text - use black for light colors, white for dark
    const isLightColor = isColorLight(shape.color);
    ctx.fillStyle = isLightColor ? '#000000' : '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(index + 1, badgeViewX, badgeViewY);

    // Draw note indicator (asterisk) if has note
    if (shape.note) {
      ctx.fillStyle = isLightColor ? '#000000' : '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('*', badgeViewX + 14, badgeViewY - 8);
    }

    // Draw note text box if notes are visible and shape has a note
    if (shape.note && notesVisible) {
      const noteX = badgeViewX + 25;
      const noteY = badgeViewY;
      const padding = 8;
      const maxWidth = 200;

      ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';

      // Word wrap the note text
      const words = shape.note.split(' ');
      const lines = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth - padding * 2) {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);

      const lineHeight = 16;
      const boxWidth = Math.min(maxWidth, Math.max(...lines.map(l => ctx.measureText(l).width)) + padding * 2);
      const boxHeight = lines.length * lineHeight + padding * 2;

      // Draw background
      ctx.fillStyle = 'rgba(26, 26, 46, 0.95)';
      ctx.beginPath();
      ctx.roundRect(noteX, noteY, boxWidth, boxHeight, 4);
      ctx.fill();

      // Draw border
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw text
      ctx.fillStyle = '#e0e0e0';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      lines.forEach((line, i) => {
        ctx.fillText(line, noteX + padding, noteY + padding + i * lineHeight);
      });
    }
  }

  function isColorLight(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5;
  }

  function getShapeBadgePosition(shape) {
    // Returns page-relative coordinates
    if (shape.type === 'rect') {
      return { x: shape.pageX, y: shape.pageY };
    } else if (shape.type === 'freehand' && shape.points.length > 0) {
      return { x: shape.points[0].x, y: shape.points[0].y };
    }
    return { x: 0, y: 0 };
  }

  function isPointInShape(viewX, viewY, shape) {
    // Convert viewport coords to page coords for comparison
    const pageX = viewX + window.scrollX;
    const pageY = viewY + window.scrollY;

    if (shape.type === 'rect') {
      return pageX >= shape.pageX - 5 && pageX <= shape.pageX + shape.width + 5 &&
             pageY >= shape.pageY - 5 && pageY <= shape.pageY + shape.height + 5;
    } else if (shape.type === 'freehand') {
      for (const pt of shape.points) {
        const dx = pageX - pt.x;
        const dy = pageY - pt.y;
        if (Math.sqrt(dx * dx + dy * dy) <= 10) return true;
      }
    }
    return false;
  }

  // Mouse event handlers
  canvas.onmousedown = (e) => {
    const x = e.clientX;
    const y = e.clientY;

    // Check if clicking on existing shape to view/edit note
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (isPointInShape(x, y, shapes[i])) {
        showNotePopup(i, x, y);
        return;
      }
    }

    isDrawing = true;
    startX = x;
    startY = y;
    freehandPoints = [{ x, y }];
  };

  canvas.onmousemove = (e) => {
    if (!isDrawing) return;
    const x = e.clientX;
    const y = e.clientY;

    redraw();

    ctx.strokeStyle = currentColor;
    ctx.lineWidth = 3;
    ctx.fillStyle = currentColor + '20';

    if (currentTool === 'rect') {
      ctx.beginPath();
      ctx.rect(startX, startY, x - startX, y - startY);
      ctx.fill();
      ctx.stroke();
    } else if (currentTool === 'freehand') {
      freehandPoints.push({ x, y });
      ctx.beginPath();
      ctx.moveTo(freehandPoints[0].x, freehandPoints[0].y);
      for (let i = 1; i < freehandPoints.length; i++) {
        ctx.lineTo(freehandPoints[i].x, freehandPoints[i].y);
      }
      ctx.stroke();
    }
  };

  canvas.onmouseup = (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    const x = e.clientX;
    const y = e.clientY;

    let newShapeIndex = -1;

    if (currentTool === 'rect') {
      const width = x - startX;
      const height = y - startY;
      if (Math.abs(width) > 5 && Math.abs(height) > 5) {
        // Store page-relative coordinates (viewport + scroll)
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        shapes.push({
          type: 'rect',
          // Page-relative coordinates
          pageX: (width > 0 ? startX : x) + scrollX,
          pageY: (height > 0 ? startY : y) + scrollY,
          width: Math.abs(width),
          height: Math.abs(height),
          color: currentColor,
          note: ''
        });
        newShapeIndex = shapes.length - 1;
      }
    } else if (currentTool === 'freehand') {
      if (freehandPoints.length > 2) {
        // Convert all points to page-relative coordinates
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        const pagePoints = freehandPoints.map(pt => ({
          x: pt.x + scrollX,
          y: pt.y + scrollY
        }));
        shapes.push({
          type: 'freehand',
          points: pagePoints,
          color: currentColor,
          note: ''
        });
        newShapeIndex = shapes.length - 1;
      }
    }

    redraw();

    // Immediately show note popup for the new shape
    if (newShapeIndex >= 0) {
      const shape = shapes[newShapeIndex];
      const popupPos = getShapeBadgePosition(shape);
      showNotePopup(newShapeIndex, popupPos.x + 20, popupPos.y + 20);
    }
  };

  // Export functions
  function copyAnnotationsText() {
    const pageHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    const pageWidth = Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth
    );

    let text = `=== UI Annotations ===\n`;
    text += `Page: ${window.location.href}\n`;
    text += `Viewport: ${window.innerWidth} x ${window.innerHeight}\n`;
    text += `Full page: ${pageWidth} x ${pageHeight}\n\n`;

    if (shapes.length === 0) {
      text += 'No annotations yet.\n';
    } else {
      shapes.forEach((shape, index) => {
        text += `[${index + 1}] `;
        if (shape.type === 'rect') {
          // Coordinates are already page-relative
          const x1 = Math.round(shape.pageX);
          const y1 = Math.round(shape.pageY);
          const x2 = Math.round(shape.pageX + shape.width);
          const y2 = Math.round(shape.pageY + shape.height);
          text += `RECT from:(${x1}, ${y1}) to:(${x2}, ${y2})`;
          // Add context about position on page
          if (y1 > window.innerHeight) {
            text += ` [${Math.round(y1 / pageHeight * 100)}% down page]`;
          }
          text += '\n';
        } else if (shape.type === 'freehand') {
          // Points are already page-relative
          const bounds = getFreehandBounds(shape.points);
          text += `FREEHAND area:(${bounds.minX}, ${bounds.minY}) to (${bounds.maxX}, ${bounds.maxY})`;
          if (bounds.minY > window.innerHeight) {
            text += ` [${Math.round(bounds.minY / pageHeight * 100)}% down page]`;
          }
          text += '\n';
        }
        if (shape.note) {
          text += `    "${shape.note}"\n`;
        }
        text += '\n';
      });
    }

    navigator.clipboard.writeText(text).then(() => {
      showToast('Annotations copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy:', err);
      showToast('Failed to copy - check console');
    });
  }

  function getFreehandBounds(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of points) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
    return { minX: Math.round(minX), minY: Math.round(minY), maxX: Math.round(maxX), maxY: Math.round(maxY) };
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #1a1a2e;
      color: #e0e0e0;
      padding: 12px 24px;
      border-radius: 8px;
      z-index: 1000001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  // Cleanup function
  function cleanup() {
    canvas.remove();
    toolbar.remove();
    notePopup.remove();
    window.__annotatorActive = false;
  }

  // Handle window resize
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    redraw();
  });

  // Handle scroll - redraw shapes at their page positions
  window.addEventListener('scroll', () => {
    redraw();
  });

  // Handle escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (notePopup.style.display !== 'none') {
        notePopup.style.display = 'none';
        selectedShapeIndex = null;
      } else {
        cleanup();
      }
    }
  });

  showToast('Annotator ready! Click and drag to draw.');
})();
