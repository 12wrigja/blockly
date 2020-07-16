'use strict';

goog.provide('Blockly.ConnectionTypeChecker');

goog.requireType('Blockly.Connection');

/**
 * Class for connection type checking logic.
 * @constructor
 */
Blockly.ConnectionTypeChecker = function() {
};

/**
 * Helper method that translates a connection error code into a string.
 * @param {number} errorCode The error code.
 * @param {!Blockly.Connection} one One of the two connections being checked.
 * @param {!Blockly.Connection} two The second of the two connections being
 *     checked.
 * @return {string} A developer-readable error string.
 * @package
 */
Blockly.ConnectionTypeChecker.prototype.getErrorMessage = function(errorCode,
    one, two) {
  switch (errorCode) {
    case Blockly.Connection.REASON_SELF_CONNECTION:
      return 'Attempted to connect a block to itself.';
    case Blockly.Connection.REASON_DIFFERENT_WORKSPACES:
      // Usually this means one block has been deleted.
      return 'Blocks not on same workspace.';
    case Blockly.Connection.REASON_WRONG_TYPE:
      return 'Attempt to connect incompatible types.';
    case Blockly.Connection.REASON_TARGET_NULL:
      return 'Target connection is null.';
    case Blockly.Connection.REASON_CHECKS_FAILED:
      var msg = 'Connection checks failed. ';
      msg += one + ' expected ' + one.check_ + ', found ' + two.check_;
      return msg;
    case Blockly.Connection.REASON_SHADOW_PARENT:
      return 'Connecting non-shadow to shadow block.';
    case Blockly.Connection.REASON_DRAG_CHECKS_FAILED:
      return 'Drag checks failed.'
    default:
      return 'Unknown connection failure: this should never happen!';
  }
};

/**
 * Checks whether the current connection can connect with the target
 * connection.
 * @param {Blockly.Connection} one Connection to check compatibility with.
 * @param {Blockly.Connection} two Connection to check compatibility with.
 * @return {number} Blockly.Connection.CAN_CONNECT if the connection is legal,
 *    an error code otherwise.
 */
Blockly.ConnectionTypeChecker.prototype.canConnectWithReason = function(one, two) {
  var validity = this.doValidityChecks(one, two);
  if (validity != Blockly.Connection.CAN_CONNECT) {
    return validity;
  }
  if (!this.checkType(one, two)) {
    return Blockly.Connection.REASON_CHECKS_FAILED;
  }
  return Blockly.Connection.CAN_CONNECT;
};

Blockly.ConnectionTypeChecker.prototype.doValidityChecks = function(one, two) {
  if (!one || !two) {
    return Blockly.Connection.REASON_TARGET_NULL;
  }
  if (one.isSuperior()) {
    var blockA = one.getSourceBlock();
    var blockB = two.getSourceBlock();
  } else {
    var blockB = one.getSourceBlock();
    var blockA = two.getSourceBlock();
  }
  // TODO (fenichel): The null checks seem like they're only for making tests
  // work better.
  if (blockA == blockB) {
    return Blockly.Connection.REASON_SELF_CONNECTION;
  } else if (two.type != Blockly.OPPOSITE_TYPE[one.type]) {
    return Blockly.Connection.REASON_WRONG_TYPE;
  } else if (blockA.workspace !== blockB.workspace) {
    return Blockly.Connection.REASON_DIFFERENT_WORKSPACES;
  } else if (blockA.isShadow() && !blockB.isShadow()) {
    return Blockly.Connection.REASON_SHADOW_PARENT;
  }
  return Blockly.Connection.CAN_CONNECT;
};

/**
 * Checks whether the current connection can connect with the target
 * connection.
 * @param {Blockly.Connection} one Connection to check compatibility with.
 * @param {Blockly.Connection} two Connection to check compatibility with.
 * @return {boolean} Whether the connection is legal.
 */
Blockly.ConnectionTypeChecker.prototype.canConnect = function(one, two,
    isDragging, shouldThrow) {
  var validity = this.doValidityChecks(one, two);
  if (validity != Blockly.Connection.CAN_CONNECT) {
    if (shouldThrow) {
      throw Error(this.getErrorMessage(validity, one, two));
    }
    return false;
  }

  var passesTypeChecks = this.checkType(one, two);
  if (!passesTypeChecks) {

    if (shouldThrow) {
      throw Error(this.getErrorMessage(
          Blockly.Connection.REASON_CHECKS_FAILED, one, two));
    }
    return false;
  }

  if (isDragging) {
    var passesDragChecks = this.passesDragChecks(one, two);
    if (!passesDragChecks) {
      if (shouldThrow) {
        throw Error(this.getErrorMessage(
            Blockly.Connection.REASON_DRAG_CHECKS_FAILED, one, two));
      }
      return false;
    }
  }
  return true;
};

/**
 * Is this connection compatible with another connection with respect to the
 * value type system.  E.g. square_root("Hello") is not compatible.
 * @param {!Blockly.Connection} one Connection to compare.
 * @param {!Blockly.Connection} two Connection to compare against.
 * @return {boolean} True if the connections share a type.
 */
Blockly.ConnectionTypeChecker.prototype.checkType = function(one, two) {
  var checkArrayOne = one.getCheck();
  var checkArrayTwo = two.getCheck();

  if (!checkArrayOne || !checkArrayTwo) {
    // One or both sides are promiscuous enough that anything will fit.
    return true;
  }
  // Find any intersection in the check lists.
  for (var i = 0; i < checkArrayOne.length; i++) {
    if (checkArrayTwo.indexOf(checkArrayOne[i]) != -1) {
      return true;
    }
  }
  // No intersection.
  return false;
};

Blockly.ConnectionTypeChecker.prototype.passesDragChecks = function(one, two) {
  // Don't consider insertion markers.
  if (two.sourceBlock_.isInsertionMarker()) {
    return false;
  }

  switch (two.type) {
    case Blockly.PREVIOUS_STATEMENT:
      return one.canConnectToPrevious_(two);
    case Blockly.OUTPUT_VALUE: {
      // Don't offer to connect an already connected left (male) value plug to
      // an available right (female) value plug.
      if ((two.isConnected() &&
          !two.targetBlock().isInsertionMarker()) ||
          one.isConnected()) {
        return false;
      }
      break;
    }
    case Blockly.INPUT_VALUE: {
      // Offering to connect the left (male) of a value block to an already
      // connected value pair is ok, we'll splice it in.
      // However, don't offer to splice into an immovable block.
      if (two.isConnected() &&
          !two.targetBlock().isMovable() &&
          !two.targetBlock().isShadow()) {
        return false;
      }
      break;
    }
    case Blockly.NEXT_STATEMENT: {
      // Don't let a block with no next connection bump other blocks out of the
      // stack.  But covering up a shadow block or stack of shadow blocks is
      // fine.  Similarly, replacing a terminal statement with another terminal
      // statement is allowed.
      if (two.isConnected() &&
          !one.sourceBlock_.nextConnection &&
          !two.targetBlock().isShadow() &&
          two.targetBlock().nextConnection) {
        return false;
      }
      break;
    }
    default:
      throw Error('Unknown connection type in passesDragChecks');
  }

  // Don't let blocks try to connect to themselves or ones they nest.
  if (Blockly.draggingConnections.indexOf(two) != -1) {
    return false;
  }

  return true;
};

/**
 * Check if the two connections can be dragged to connect to each other.
 * This is used by the connection database when searching for the closest
 * connection.
 * @param {!Blockly.Connection} one The connection to check, which must be a
 *     statement input or next connection.
 * @param {!Blockly.Connection} two A nearby connection to check, which
 *     must be a previous connection.
 * @return {boolean} True if the connection is allowed, false otherwise.
 * @private
 */
Blockly.ConnectionTypeChecker.prototype.canConnectToPrevious_ = function(one, two) {
  if (one.targetConnection) {
    // This connection is already occupied.
    // A next connection will never disconnect itself mid-drag.
    return false;
  }

  // Don't let blocks try to connect to themselves or ones they nest.
  if (Blockly.draggingConnections.indexOf(two) != -1) {
    return false;
  }

  if (!two.targetConnection) {
    return true;
  }

  var targetBlock = two.targetBlock();
  // If it is connected to a real block, game over.
  if (!targetBlock.isInsertionMarker()) {
    return false;
  }
  // If it's connected to an insertion marker but that insertion marker
  // is the first block in a stack, it's still fine.  If that insertion
  // marker is in the middle of a stack, it won't work.
  return !targetBlock.getPreviousBlock();
};
