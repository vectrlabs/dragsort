;(function ( $, window, document, undefined ) {

  var pluginName = 'dragsort';

  // Defaults
  var defaults = {
    selectedClass : 'selected',
    draggingClass : 'dragging',
    noDragSelectors: '',
    minSelection  : Number.POSITIVE_INFINITY,
    animationSpeed: 150,
    boundingBoxPadding: 75,
    multi: true,
    onSortStart: function() {},
    onSort: function() {},
    onSelectionChange: function() {},
    onSortEnd: function() {},
  };

  var $window = $(window);
  var $dragPreview;
  var dropIndex;

  /**
   * Plugin contructor. Note that this.$element must have position:relative or
   * position:absolute to work correctly.
   *
   * @param {object} element DOM Object
   * @param {object} options Plugin options
   */
  function Plugin( element, options ) {
    this.element = element;
    this.$element = $(element);

    this.options = $.extend({}, defaults, options) ;

    this._defaults = defaults;
    this._name = pluginName;

    // bind the plugin's events
    this.$element.on('mousedown', this.options.sortSelector, $.proxy(this.mousedownItem, this));
    this.$element.on('click', this.options.sortSelector, $.proxy(this.clickItem, this));

    // instance vars
    this.draggingOutsideElement = false;
    this.itemWidth = 0;
    this.itemHeight = 0;
    this.centerPoints = [];
    this.dragBounds = {};
    this.shiftIndex = 0;
    this.$sortSelection;
    this.$shiftRange;
    this.$activeItem;
    this.$items;
    this.dropIndex;
  }

  /**
   * Start sorting if/when user begins to drag a sortable item.
   *
   * @param  {object} e jQuery Event Object
   * @return {undefined}
   */
  Plugin.prototype.sortStart = function(e) {
    var self = this;

    self.itemWidth    = self.$activeItem.outerWidth();
    self.itemHeight   = self.$activeItem.outerHeight();
    self.$items       = self.$element.find(self.options.sortSelector + ':not(.' + self.options.selectedClass + ')');
    self.centerPoints = [];
    $dragPreview      = self.$activeItem.clone();
    dropIndex         = 0;

    $dragPreview.css({
        width   : self.itemWidth,
        height  : self.itemHeight,
        position: 'absolute',
        'pointer-events' : 'none'
      })
      .addClass(self.options.draggingClass)
      .appendTo( $('body') );

    self.setSortSelection();

    // Append a preview number if we're dragging more than 1 item
    if(self.$sortSelection.length > 1) {
      $dragPreview.append( $('<div class="drag_preview_number" />').text(self.$sortSelection.length) );
    }

    // Set draggable item center points
    self.setCenterPoints();

    // Hide the selected pages & Set Center Points.
    self.$sortSelection.slideUp(self.options.animationSpeed, function() {
      // Reset draggable item center points once everything's scrolled up
      self.setCenterPoints();
      self.setDragBounds();
    });

    // position the drag sort initially
    self.sort.call(self, e);

    $window.on('mousemove', $.proxy(self.sort, self));
    $window.one('mouseup', $.proxy(self.sortEnd, self));

    // Callback
    self.options.onSortStart.call(self, e);
  }

  /**
   * Set the bounds within which we must be dragging
   * for a valid drop.
   */
  Plugin.prototype.setDragBounds = function() {
    this.dragBounds = {
      x : this.$element.offset().left - this.options.boundingBoxPadding,
      y : this.$element.offset().top - this.options.boundingBoxPadding,
      x2: this.$element.offset().left + this.$element.outerWidth() + this.options.boundingBoxPadding*2,
      y2: this.$element.offset().top + this.$element.outerHeight() + this.options.boundingBoxPadding*2
    };
  }

  /**
   * Drag the selected preview, and show a preview where it would
   * be dropped on mouseup.
   *
   * @param  {object} e jQuery Event Object
   * @return {undefined}
   */
  Plugin.prototype.sort = function(e) {
    var self = this;

    // Position the preview
    $dragPreview.css({
      left: e.clientX - self.itemWidth / 2,
      top: e.clientY - self.itemHeight / 2
    });

    // Don't do anything until centerPoints have been set
    if( self.centerPoints.length === 0 || !self.dragBounds) {
      return;
    }

    // If we drop outside the bounds we cancel the sort, so, if we drag
    // outside the previews clear all previews and return.
    if( !self.isWithinDragBounds(e) ) {
      if( !self.draggingOutsideElement ) {
        self.draggingOutsideElement = true;
        dropIndex = -1;
        self.clearDropPreviews();
      }
      return;

    } else {
      self.draggingOutsideElement = false;
    }

    // Get cursor's y-position relative to the scrolled element
    var cursorY = e.pageY - self.$element.offset().top + self.$element.scrollTop();

    // ok are centerpoints wrong or is cursorY wrong...centerpoints are wrong...
    // or aren't they suppose to be relative to window?

    // See which center point this cursor comes after
    var insertAfter = self.centerPoints.reduce(function(prev, curr) {
      return (curr > prev && curr <= cursorY) ? curr : prev;
    });

    // Get the index of that point
    var pointIndex = self.centerPoints.indexOf(insertAfter);

    // Change the position of the drop preview if we've dragged to a
    // new position
    if(dropIndex !== pointIndex) {
      self.clearDropPreviews();
      self.centerPoints = [];

      // Append after indexed element
      if( self.$items.eq(pointIndex).length !== 0 ) {
        $('<div class="drop_preview" />').hide().insertBefore( self.$items.eq(pointIndex) ).slideDown(self.options.animationSpeed, function() {
          self.setCenterPoints();
        });

      // Append to end of container
      } else {
        $('<div class="drop_preview" />').hide().appendTo( self.$element ).slideDown(self.options.animationSpeed, function() {
          self.setCenterPoints();
        });

      }

      dropIndex = pointIndex;
    }

    // Callback
    self.options.onSort.call(self, e, dropIndex, self.getSelectedIndexes());
  };

  /**
   * When we finish our drag, trigger a callback or cancel the resort
   * if we've dropped in a place that won't trigger any changes.
   *
   * @param  {object} e jQuery Event Object
   * @return {undefined}
   */
  Plugin.prototype.sortEnd = function(e) {
    this.clearDropPreviews();
    $dragPreview.remove();
    $window.off('mousemove', this.sort);

    // If droppped outside the container cancel the sort
    if(!this.isWithinDragBounds(e)) {
      this.cancelSortPreview();
      return;
    }

    // Consecutive and dropped in the same place, cancel
    var firstIndex = this.$sortSelection.first().index(this.options.sortSelector);
    var lastIndex  = this.$sortSelection.last().index(this.options.sortSelector);
    if( (lastIndex - firstIndex === this.$sortSelection.length - 1) && dropIndex === firstIndex ) {
      this.cancelSortPreview();
      return;
    }

    var originalIndexes = this.getSelectedIndexes();

    // Append after indexed element or end of container
    if( this.$items.eq(dropIndex).length !== 0 ) {
      this.$sortSelection.insertBefore( this.$items.eq(dropIndex) ).slideDown(this.options.animationSpeed);
    } else {
      this.$sortSelection.appendTo( this.$element ).slideDown(this.options.animationSpeed);
    }

    // Callback
    this.options.onSortEnd.call(this, e, dropIndex, originalIndexes);
  };

  /**
   * Handle mousedown events on a draggable item; we use this
   * to detect whether the user drags while in mousedown. If the
   * user doesn't drag during mousedown, this does nothing.
   *
   * @param  {object} e jQuery Event Object
   * @return {undefined}
   */
  Plugin.prototype.mousedownItem = function(e) {

    // If right click, this event happens on ignored classes, ignore it
    if( e.which === 3 || this.options.ignore && ($(e.target).is(this.options.ignore) || $(e.target).parents(this.options.ignore).length > 0) ) {
      return;
    }

    var self  = this;
    var $item = $(e.currentTarget);
    var ox    = e.pageX;
    var oy    = e.pageY;

    // Bind drag / sort if we have one or more items to sort
    if( $(this.options.sortSelector).length > 1 ) {
      // Bind initial
      $window.on('mousemove', detectDrag);

      // Unbind (if it wasn't already)
      $window.one('mouseup', function() {
        $window.off('mousemove', detectDrag);
      });
    }

    /**
     * Detect a drag of 20px or more during mousedown; if we detect it,
     * start the drag sorting.
     *
     * @param  {object} e jQuery Event Object
     * @return {undefined}
     */
     function detectDrag(e) {
      if(Math.abs(ox - e.pageX) < 20 && Math.abs(oy - e.pageY) < 20) {
        return;
      }

      // If we start to drag something that's not selected, make this the only
      // selected item.
      if( !$item.hasClass(self.options.selectedClass) ) {
        var $deselect = self.$element.find('.' + self.options.selectedClass).not( $item );
        self.deselectItems( $deselect );
        self.selectItems( $item );

        // Callback
        self.setSortSelection();
        self.options.onSelectionChange.call(self, self.getSelectedIndexes(), self.$sortSelection);
      }

      self.$activeItem = $item;
      $window.off('mousemove', detectDrag);
      self.sortStart(e);
    }
  };

  /**
   * Handle click events on a sortable item; this is used to define
   * our selection.
   *
   * @param  {object} e jQuery Event Object
   * @return {undefined}
   */
  Plugin.prototype.clickItem = function(e) {
    var $clicked    = $(e.target);
    var clickIndex  = $clicked.index();

    // If meta or control click, add or remove clicked item from selection
    if(this.options.multi && e.metaKey || e.ctrlKey) {

      if($clicked.hasClass(this.options.selectedClass)) {
        this.deselectItems( $clicked );

        // Remove from shiftRange, if necessary
        if(this.$shiftRange) {
          this.$shiftRange = this.$shiftRange.not( $clicked );
        }

        // If we unset our shiftIndex, set to 0
        if(this.shiftIndex === clickIndex) {
          this.shiftIndex = 0;
        }

      } else {
        this.selectItems( $clicked );
        this.shiftIndex = clickIndex;
      }
    }

    // If shift click, set (or reset) range of selection
    if(this.options.multi && e.shiftKey) {

      var prevSelector = this.options.sortSelector + ':eq(' + this.shiftIndex + ')';
      var $newShiftRange;

      if(this.shiftIndex === clickIndex) {
        $newShiftRange = $clicked;
      } else if(this.shiftIndex < clickIndex) {
        $newShiftRange = $clicked.prevUntil(prevSelector).add( $clicked ).add(prevSelector);
      } else {
        $newShiftRange = $clicked.nextUntil(prevSelector).add( $clicked ).add(prevSelector);
      }

      if(this.$shiftRange) {
        this.selectItems( $newShiftRange.not( this.$shiftRange ) );
        this.deselectItems( this.$shiftRange.not( $newShiftRange ) );
      } else {
        this.selectItems( $newShiftRange );

      }

      this.$shiftRange = $newShiftRange;
    }

    // If normal click, set selection to only the clicked item
    if( !this.options.multi || (!e.ctrlKey && !e.metaKey && !e.shiftKey) ) {
      var $deselect = this.$element.find('.' + this.options.selectedClass).not( $clicked );

      if( !$clicked.hasClass(this.options.selectedClass) ) {
        this.selectItems( $clicked );
      }

      this.$shiftRange = $clicked;
      this.deselectItems( $deselect );
      this.shiftIndex = clickIndex;
    }

    // Callback
    this.setSortSelection();
    this.options.onSelectionChange.call(this, this.getSelectedIndexes(), this.$sortSelection);
  };

  /**
   * Save the centerpoint y-coordinates of each draggable item and 0 for
   * container start. Used to determine which index we're going to drop on.
   *
   * @return {undefined}
   */
  Plugin.prototype.setCenterPoints = function() {
    var self  = this;
    scrollTop = self.$element.scrollTop();

    self.centerPoints = [0];

    self.$items.each(function(i, item) {
      var $item = $(item);
      self.centerPoints.push( $item.position().top + ($item.outerHeight() / 2) + scrollTop );
    });
  }

  /**
   * Check if we're dragging within our bounds; the bounds include the element's
   * dimensions as well as optional padding around the element.
   *
   * @param  {object}  e jQuery Event Object
   * @return {Boolean}   True if inside drag bounds
   */
  Plugin.prototype.isWithinDragBounds = function(e) {
    var db = this.dragBounds;
    return e.clientX > db.x && e.clientX < db.x2 && e.clientY > db.y && e.clientY < db.y2;
  }

  /**
   * Cancel the sort by not triggering a change and sliding the hidden items
   * back down
   *
   * @param  {object} e jQuery Event Object
   */
  Plugin.prototype.cancelSortPreview = function(e) {
    var $selected = this.$element.find('.' + this.options.selectedClass);
    $selected.slideDown(this.options.animationSpeed);
  };

  /**
   * Slide up then remove .drop_preview
   *
   * @return {undefined}
   */
  Plugin.prototype.clearDropPreviews = function() {
    this.$element.find('.drop_preview').slideUp(this.options.animationSpeed, function() {
      $(this).remove();
    });
  };

  /**
   * Get the indexes of everything that's selected
   *
   * @return {array} Indexes of selected items
   */
  Plugin.prototype.getSelectedIndexes = function() {
    var self = this;
    var sortSelector = this.options.sortSelector;
    var indexes = [];

    self.$element.addClass('test')

    this.$sortSelection.each(function(i, el) {
      indexes.push( self.$element.find(sortSelector).index(el) );
    });

    return indexes.sort();
  }

  /**
   * Set the jQuery Element that contains our sort selection
   */
  Plugin.prototype.setSortSelection = function() {
    this.$sortSelection = this.$element.find('.'+this.options.selectedClass);
  }

  /**
   * Public version of selectItems with callback
   */
  Plugin.prototype.selectItems = function($el) {
    $el.addClass(this.options.selectedClass);

    // Callback
    this.setSortSelection();
    this.options.onSelectionChange.call(this, this.getSelectedIndexes(), this.$sortSelection);
  };

  /**
   * Public version of deselectItems with callback
   */
  Plugin.prototype.deselectItems = function($el) {
    $el.removeClass(this.options.selectedClass);

    // Callback
    this.setSortSelection();
    this.options.onSelectionChange.call(this, this.getSelectedIndexes(), this.$sortSelection);
  };

  // Plugin Wrapper
  $.fn[pluginName] = function ( options ) {
    return this.each(function () {
      if (!$.data(this, 'plugin_' + pluginName)) {
        $.data(this, 'plugin_' + pluginName,
        new Plugin( this, options ));
      }
    });
  }

})( jQuery, window, document );
