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
    nestedMenuClass: 'nested_menu',
    multi: true,
    onSortStart: function() {},
    onSort: function() {},
    onSelectionChange: function() {},
    onSortEnd: function() {},
  };

  var $window = $(window);
  var stopProp = {};
  var $dragPreview;
  var dropIndex;
  var userSelectCSS;



  // - See shift select bugs
  // - remove nested list from preview
  // - I need filters for locked and unlocked too...could want to have filters for lots of things...

  // - do really fast drags work?
  // - indexes API...make sure this can account for dragging something things that come from children and some things that come from parents at the same time...ie meta clicking something in a child and something in parents
  // - Hook Vectr up w/ the modified API
  // - I'm gonna have to tell the plugin how deeply to nest different things...



  /**
   * Plugin contructor. Note that this.$element must have position:relative or
   * position:absolute to work correctly.
   *
   * @param {object} element DOM Object
   * @param {object} options Plugin options
   */
  function Plugin( element, options ) {
    this.element      = element;
    this.$element     = $(element);
    this.$activeList  = this.$element;

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
    var self      = this;
    var mockEvent = $.Event('', { currentTarget: self.$activeItem[0] });

    self.itemWidth    = self.$activeItem.outerWidth();
    self.itemHeight   = self.$activeItem.outerHeight();
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

    // Set the active list and items
    self.setActiveList( mockEvent );

    // Hide the selected pages & Set Center Points.
    self.$sortSelection.slideUp(self.options.animationSpeed, function() {
      // Reset draggable item center points once everything's scrolled up
      self.setActiveList( mockEvent );
      self.setDragBounds();
    });

    // Save the current user select, so that it can be replaced
    // when the drag ends. Then disable select while dragging
    userSelectCSS = self.$element.css('user-select');
    self.$element.css('user-select', 'none');

    // position the drag sort initially
    self.sort.call(self, e);

    self.$element.on('mouseenter mouseleave', '.' + self.options.nestedMenuClass, $.proxy(self.setActiveList, self));

    $window.on('mousemove mousewheel', $.proxy(self.sort, self));
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
    // TODO: Take into account window scroll...
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
    var cursorY = e.pageY - self.$activeList.offset().top + self.$activeList.scrollTop();

    // See which center point this cursor comes after
    var insertAfter = self.centerPoints.reduce(function(prev, curr) {
      return (curr > prev && curr <= cursorY) ? curr : prev;
    });

    // Get the index of that point
    var pointIndex = self.centerPoints.indexOf(insertAfter);

    // Change the position of the drop preview if we've dragged to a
    // new position
    if(dropIndex !== pointIndex) {
      var $preview = $('<div class="drop_preview" />').hide();

      self.clearDropPreviews();
      self.centerPoints = [];

      // Append after indexed element
      if( self.$items.eq(pointIndex).length !== 0 ) {
        $preview.insertBefore( self.$items.eq(pointIndex) ).slideDown(self.options.animationSpeed, function() {
          self.setCenterPoints(e);
        });

      // Append to end of container
      } else {
        $preview.appendTo( self.$activeList ).slideDown(self.options.animationSpeed, function() {
          self.setCenterPoints(e);
        });

        // Make sure the drop preview is scrolled into view
        self.$activeList.scrollTop( self.$activeList.outerHeight() );
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
    $window.off('mousemove mousewheel', this.sort);
    this.$element.off('mouseenter mouseleave', '.' + this.options.nestedMenuClass, this.setActiveList);

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

    // Replace the original user-select
    this.$element.css('user-select', userSelectCSS);

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
    var ig = this.options.ignore;

    // If already did a mousedown, right click, or this event happens on ignored classes, ignore it
    if( isBubble('mousedown') || e.which === 3 || ig && ($(e.target).is(ig) || $(e.target).parents(ig).length > 0) ) {
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

    // Only handle on first clicked
    if(isBubble('click')){
      return;
    }

    var self        = this;
    var $clicked    = $(e.currentTarget);
    var ss          = self.options.sortSelector;
    var clickIndex  = $clicked.index(ss);

    // If meta or control click, add or remove clicked item from selection
    if(this.options.multi && e.metaKey || e.ctrlKey) {
      if($clicked.hasClass(this.options.selectedClass)) {
        this.deselectItems( $clicked.find(ss).add($clicked) );

        // Remove from shiftRange, if necessary
        if(this.$shiftRange) {
          this.$shiftRange = this.$shiftRange.not( $clicked );
        }

        // If we unset our shiftIndex, set to 0
        if(this.shiftIndex === clickIndex) {
          this.shiftIndex = 0;
        }

        // Deselect parent. Parent can only be selected if ALL children are selected.
        this.deselectItems( $clicked.parents(ss+'.'+self.options.selectedClass) );

      } else {
        this.selectItems( $clicked.find(ss).add($clicked) );
        this.shiftIndex = clickIndex;
      }
    }

    // TODO: Some of shift select still doesn't work perfectly but good enough
    // for now. It doesn't keep things outside the shiftRange selected, and can
    // sometimes have parent-level items deselected when not all children are selected

    // If shift click, set (or reset) range of selection
    if(this.options.multi && e.shiftKey) {
      var $newShiftRange;
      var $commonParent;

      // Set to only the clicked element
      if(this.shiftIndex === clickIndex) {
        $newShiftRange = $clicked;

      // Set to a range of elements
      } else {
        var sliceMin = Math.min(this.shiftIndex, clickIndex);
        var sliceMax = Math.max(this.shiftIndex, clickIndex);
        var rangeIndexes;

        // Select the range of elements
        $newShiftRange  = self.$element.find(ss).slice(sliceMin, sliceMax + 1);
        rangeIndexes    = self.getIndexes( $newShiftRange );

        // If any parent-level items have only part of their
        // children included in $newShiftRange, keep the children
        // but remove the parent from the selection.
        $newShiftRange.each(function() {
          var $children = $(this).find(ss);

          if($children.length && !$clicked.is(this)) {
            // Check whether all children are included in the selection
            var indexes = self.getIndexes( $children );
            var containsAllChildren = indexes.every(function(val) { return rangeIndexes.indexOf(val) >= 0; });

            // If not all children are included, remove parent from selection
            if(!containsAllChildren) {
              $newShiftRange = $newShiftRange.not( $(this) );
            }
          }
        });
      }

      // Select the shift range
      if(this.$shiftRange) {
        this.selectItems( $newShiftRange.not( this.$shiftRange ).find(ss).add( $newShiftRange ) );
        this.deselectItems( this.$shiftRange.not( $newShiftRange ) );
      } else {
        this.selectItems( $newShiftRange.find(ss).add( $newShiftRange ) );
      }

      this.$shiftRange = $newShiftRange;
    }

    // If normal click, set selection to only the clicked item
    if( !this.options.multi || (!e.ctrlKey && !e.metaKey && !e.shiftKey) ) {
      var $select   = $clicked.find(ss).add( $clicked );
      var $deselect = this.$element.find('.' + this.options.selectedClass).not( $select );

      this.$shiftRange = $clicked;
      this.selectItems( $select );
      this.deselectItems( $deselect );
      this.shiftIndex = clickIndex;
    }

    // Callback
    this.setSortSelection();
    this.options.onSelectionChange.call(this, this.getSelectedIndexes(), this.$sortSelection);
  };

  /**
   * Set the currently active list. If hovering a nested
   * list, that is our active list, otherwise the top
   * level element is active.
   *
   * @param {object} e $.Event Object
   */
  Plugin.prototype.setActiveList = function(e) {
    var self    = this;
    var $target = $(e.currentTarget);
    var ss      = this.options.sortSelector;
    var sc      = this.options.selectedClass;

    // TODO: '>' assumes no wrapping...not smart enough
    function setList($list) {
      self.$activeList  = $list;
      self.$items       = self.$activeList.find('> ' + ss + ':not(.' + sc + ')');
      self.setCenterPoints();
    }

    // On mouseenter just set to target
    if(e.type === 'mouseenter') {
      setList( $target );
      return;
    }

    // Otherwise see if we're deeply nested and set to next highest parent,
    // otherwise set to element.
    var $nestedParent = $target.parents('.' + self.options.nestedMenuClass);

    if($nestedParent.length > 0) {
      setList( $nestedParent );
    } else {
      setList( self.$element );
    }
  }

  /**
   * Save the centerpoint y-coordinates of each draggable item and 0 for
   * container start. Used to determine which index we're going to drop on.
   *
   * @return {undefined}
   */
  Plugin.prototype.setCenterPoints = function(e) {
    var self      = this;
    var listTop   = self.$activeList.offset().top;
    var scrollTop = self.$activeList.scrollTop();

    // First center point is top of container
    self.centerPoints = [0];

    // Set center point relative to active list
    self.$items.each(function(i, item) {
      var $item   = $(item);
      var height  = $item.outerHeight();
      var $nested = $item.find('.' + self.options.nestedMenuClass);

      // Subtract the height of every nested menu to get
      // only the height of the item itself
      if($nested.length > 0) {
        $nested.each(function() {
          height -= $(this).outerHeight();
        });
      }

      self.centerPoints.push( ($item.offset().top - listTop) + (height / 2) + scrollTop );
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
   * Slide up then remove .drop_preview and reset active menu
   * to the top level menu
   *
   * @return {undefined}
   */
  Plugin.prototype.clearDropPreviews = function() {
    this.$element.find('.drop_preview').slideUp(this.options.animationSpeed, function() {
      $(this).remove();
    });
  };

  /**
   * Return an array of indexes for a $ selection
   *
   * @param  {object} $elements   $ Selection
   * @return {array} Indexes      Indees of selected items
   */
  Plugin.prototype.getIndexes = function( $elements ) {
    var self = this;
    var indexes = [];

    $elements.each(function(i, el) {
      indexes.push( self.$element.find(self.options.sortSelector).index(el) );
    });

    return indexes.sort();
  }

  /**
   * Wrapper for getIndexes
   *
   * @return #see getIndexes
   */
  Plugin.prototype.getSelectedIndexes = function() {
    return this.getIndexes( this.$sortSelection );
  }

  /**
   * Set the jQuery Element that contains our sort selection
   */
  Plugin.prototype.setSortSelection = function() {
    var self = this;

    // Select only top-level elements, keep nested elements nested
    self.$sortSelection = self.$element.find('.'+self.options.selectedClass).filter(function() {
      return !$(this).parents('.'+self.options.selectedClass).length;
    });
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

  /**
   * Detect whether an event is bubbling (i.e. if it has
   * already been handled in our plugin). This lets us
   * stopPropgation within only our plugin.
   *
   * @param  {string}  eventName JS Event Name
   * @return {Boolean}           True if event is bubbling
   */
  function isBubble(eventName) {
    if(stopProp[eventName] === true) {
      return true;
    }

    // Set the bubbling to true
    stopProp[eventName] = true;

    // Unset the bubble once we reach the window
    $window.one(eventName, function() {
      stopProp[eventName] = false;
    });

    // Not bubbling on first call
    return false;
  }

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
