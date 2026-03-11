import { useRef, useState } from "react";

export function moveArrayItem(items, fromIndex, toIndex) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return [...items];
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function useRowReorder(rows, setRows) {
  const [dragFromIndex, setDragFromIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const activePointerIdRef = useRef(null);
  const activeGroupRef = useRef("");

  const moveRow = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) {
      return;
    }

    setRows(moveArrayItem(rows, fromIndex, toIndex));
  };

  const handleDragStart = (index, event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    activePointerIdRef.current = event.pointerId;
    activeGroupRef.current =
      event.currentTarget?.getAttribute("data-reorder-group") ?? "";
    setDragFromIndex(index);
    setDragOverIndex(index);

    if (event.currentTarget?.setPointerCapture) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures in browsers that partially implement Pointer Events.
      }
    }

    event.preventDefault();
  };

  const handleDragMove = (event) => {
    if (
      activePointerIdRef.current !== event.pointerId ||
      dragFromIndex === null
    ) {
      return;
    }

    const hoveredElement = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-reorder-index][data-reorder-group]");
    if (!hoveredElement) {
      return;
    }

    if (
      hoveredElement.getAttribute("data-reorder-group") !==
      activeGroupRef.current
    ) {
      return;
    }

    const hoveredIndex = Number(
      hoveredElement.getAttribute("data-reorder-index"),
    );
    if (!Number.isInteger(hoveredIndex)) {
      return;
    }

    setDragOverIndex((previous) =>
      previous === hoveredIndex ? previous : hoveredIndex,
    );
    event.preventDefault();
  };

  const completeDrag = (event, cancel = false) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    if (
      event.currentTarget?.hasPointerCapture?.(event.pointerId) &&
      event.currentTarget?.releasePointerCapture
    ) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore release failures in browsers that partially implement Pointer Events.
      }
    }

    const sourceIndex = dragFromIndex;
    const targetIndex = dragOverIndex ?? sourceIndex;

    activePointerIdRef.current = null;
    activeGroupRef.current = "";
    setDragFromIndex(null);
    setDragOverIndex(null);

    if (
      cancel ||
      sourceIndex === null ||
      targetIndex === null ||
      sourceIndex === targetIndex
    ) {
      return;
    }

    moveRow(sourceIndex, targetIndex);
  };

  const moveRowUp = (index) => {
    if (index <= 0) {
      return;
    }

    moveRow(index, index - 1);
  };

  const moveRowDown = (index) => {
    if (index >= rows.length - 1) {
      return;
    }

    moveRow(index, index + 1);
  };

  const isDragSource = (index) => dragFromIndex === index;
  const isDropTarget = (index) =>
    dragFromIndex !== null &&
    dragOverIndex === index &&
    dragFromIndex !== index;

  return {
    handleDragStart,
    handleDragMove,
    completeDrag,
    moveRowUp,
    moveRowDown,
    isDragSource,
    isDropTarget,
  };
}
