// ── Table Node ──
//
// Uses ProseKit's table schema / commands, but keeps only `tableEditing()`.
// Column resizing is intentionally disabled so tables stay content-driven
// and wrap inside the editor width instead of introducing horizontal drag UI.

import { defaultBlockAt, defineKeymap, definePlugin, union, type Extension } from "prosekit/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "prosekit/pm/model";
import { NodeSelection, TextSelection, type Command } from "prosekit/pm/state";
import {
  defineTableCellSpec,
  defineTableCommands,
  defineTableDropIndicator,
  defineTableHeaderCellSpec,
  defineTableRowSpec,
  defineTableSpec,
} from "prosekit/extensions/table";
import {
  addRowAfter,
  findTable,
  goToNextCell,
  isInTable,
  tableEditing,
  type TableRole,
} from "prosemirror-tables";

function goToNextCellOrCreateRow(direction: -1 | 1): Command {
  return (state, dispatch, view) => {
    const move = goToNextCell(direction);
    if (move(state, dispatch, view)) return true;

    if (direction < 0 || !isInTable(state)) return false;
    if (!dispatch) return addRowAfter(state);

    if (!addRowAfter(state, dispatch)) return false;
    const nextState = view?.state;
    if (!nextState) return true;

    goToNextCell(direction)(nextState, view.dispatch, view);
    return true;
  };
}

function exitTableToParagraph(): Command {
  return (state, dispatch) => {
    const table = resolveTableForSelection(state.selection.$head);
    if (!table) return false;

    const afterPos = table.pos + table.node.nodeSize;
    const nextSibling = resolveSiblingAfterNode(state.doc, table.pos, table.node);
    if (nextSibling?.node.type.name === "paragraph") {
      if (dispatch) {
        dispatch(
          state.tr
            .setSelection(TextSelection.near(state.doc.resolve(afterPos + 1), 1))
            .scrollIntoView(),
        );
      }
      return true;
    }

    return insertDefaultBlockAfterTable(state, dispatch, table.pos, table.node);
  };
}

function selectTableNode(): Command {
  return (state, dispatch) => {
    const table = resolveTableForSelection(state.selection.$head);
    if (!table) return false;

    if (dispatch) {
      dispatch(state.tr.setSelection(NodeSelection.create(state.doc, table.pos)).scrollIntoView());
    }

    return true;
  };
}

function resolveTableForSelection($pos: ResolvedPos): {
  node: ProseMirrorNode;
  pos: number;
} | null {
  const table = findTable($pos);
  if (table) return { node: table.node, pos: table.pos };

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if ((node.type.spec.tableRole as TableRole) === "table") {
      return { node, pos: $pos.before(depth) };
    }
  }

  return null;
}

function resolveSiblingAfterNode(
  doc: ProseMirrorNode,
  pos: number,
  node: ProseMirrorNode,
): { node: ProseMirrorNode; pos: number } | null {
  const resolved = doc.resolve(pos);
  const parent = resolved.parent;
  const index = resolved.index();
  const nextIndex = index + 1;
  if (nextIndex >= parent.childCount) return null;

  return { node: parent.child(nextIndex), pos: pos + node.nodeSize };
}

function insertDefaultBlockAfterTable(
  state: Parameters<Command>[0],
  dispatch: Parameters<Command>[1],
  pos: number,
  node: ProseMirrorNode,
): boolean {
  const resolved = state.doc.resolve(pos);
  const parent = resolved.parent;
  const insertIndex = resolved.index() + 1;
  const type = defaultBlockAt(parent.contentMatchAt(insertIndex));

  if (!type || !parent.canReplaceWith(insertIndex, insertIndex, type)) {
    return false;
  }

  const block = type.createAndFill();
  if (!block) return false;

  if (dispatch) {
    const insertPos = pos + node.nodeSize;
    const tr = state.tr.insert(insertPos, block);
    tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1), 1));
    dispatch(tr.scrollIntoView());
  }

  return true;
}

function defineTableKeymap(): Extension {
  const nextCell = goToNextCellOrCreateRow(1);
  const previousCell = goToNextCellOrCreateRow(-1);
  const exitAfter = exitTableToParagraph();
  const selectTable = selectTableNode();

  return defineKeymap({
    Tab: nextCell,
    "Shift-Tab": previousCell,
    "Mod-Enter": exitAfter,
    "Ctrl-Enter": exitAfter,
    Escape: selectTable,
  });
}

function defineTable(): Extension {
  return union(
    defineTableSpec(),
    defineTableRowSpec(),
    defineTableCellSpec(),
    defineTableHeaderCellSpec(),
    definePlugin([tableEditing({ allowTableNodeSelection: true })]),
    defineTableKeymap(),
    defineTableCommands(),
    defineTableDropIndicator(),
  );
}

export {
  defineTable,
  exitTableToParagraph as exitTableToParagraphForTest,
  goToNextCellOrCreateRow as goToNextCellOrCreateRowForTest,
  selectTableNode as selectTableNodeForTest,
};
