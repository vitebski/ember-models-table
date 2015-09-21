import Ember from 'ember';
import SortableMixin from 'ember-legacy-controllers/utils/sortable-mixin';
import fmt from '../utils/fmt';

const S = Ember.String;
const keys = Object.keys;

const {
  get,
  set,
  getWithDefault,
  setProperties,
  computed,
  observer,
  isNone,
  A
} = Ember;

var defaultMessages = {
  searchLabel: 'Search:',
  'columns-title': 'Columns',
  'columns-showAll': 'Show All',
  'columns-hidAll': 'Hide All',
  'columns-restoreDefaults': 'Restore Defaults',
  tableSummary: 'Show %@ - %@ of %@',
  allColumnsAreHidden: 'All columns are hidden. Use <strong>columns</strong>-dropdown to show some of them',
  noDataToShow: 'No records to show'
};

/**
 * data -> filteredContent (and content as its alias) -> arrangedContent -> visibleContent
 */
export default Ember.Component.extend(SortableMixin, {

  /**
   * Number of records shown on one table-page (size of the <code>visibleContent</code>)
   * @type {number}
   */
  pageSize: 10,

  /**
   * @type {number}
   */
  currentPageNumber: 1,

  /**
   * @type {string[]}
   */
  sortProperties: A([]),

  /**
   * @type {boolean}
   */
  sortAscending: true,

  /**
   * Should table footer be shown on the page
   * @type {boolean}
   */
  showTableFooter: true,

  /**
   * Determines if `table-striped` should be added to the table
   * @type {boolean}
   */
  tableStriped: true,

  /**
   * Determines if `table-bordered` should be added to the table
   * @type {boolean}
   */
  tableBordered: true,

  /**
   * Determines if `table-condensed` should be added to the table
   * @type {boolean}
   */
  tableCondensed: true,

  /**
   * Determines if numeric pagination should be used
   * @type {boolean}
   */
  useNumericPagination: false,

  /**
   * Determines if columns-dropdown should be shown
   * @type {boolean}
   */
  showColumnsDropdown: true,

  /**
   * Determines if filtering by columns should be available to the user
   * @type {boolean}
   */
  useFilteringByColumns: true,

  /**
   * @type {string}
   */
  filterString: '',

  /**
   * Determines if filtering (global and by column) should ignore case
   * @type {boolean}
   */
  filteringIgnoreCase: false,

  /**
   * Determines if "Global filter"-field should be shown
   * @type {boolean}
   */
  showGlobalFilter: true,

  /**
   * All table records
   * @type {Ember.Object[]}
   */
  data: A([]),

  /**
   * Table columns
   * Allowed fields:
   *  - propertyName
   *  - title
   *  - template
   *  - sortedBy
   *  - isHidden
   * @type {Ember.Object[]}
   */
  columns: A([]),

  /**
   * @type {Object}
   */
  messages: Ember.Object.create({}),

  /**
   * Template with First|Prev|Next|Last buttons
   * @type {string}
   */
  simplePaginationTemplate: 'components/models-table/simple-pagination',

  /**
   * True if all columns are hidden by <code>isHidden</code>
   * @type {boolean}
   */
  allColumnsAreHidden: computed('columns.@each.isHidden', function () {
    var columns = get(this, 'columns');
    return columns.length > 0 && columns.isEvery('isHidden', true);
  }),

  /**
   * Number of pages
   * @type {number}
   */
  pagesCount: computed('arrangedContent.[]', 'pageSize', function () {
    var pagesCount = get(this, 'arrangedContent.length') / get(this, 'pageSize');
    return (pagesCount % 1 === 0) ? pagesCount : (Math.floor(pagesCount) + 1);
  }),

  /**
   * List of links to the page
   * Used if <code>useNumericPagination</code> is true
   * @type {{isLink: boolean, label: string, isActive: boolean}[]}
   */
  visiblePageNumbers: computed('arrangedContent.[]', 'pagesCount', 'currentPageNumber', function () {
    var pagesCount = get(this, 'pagesCount');
    var currentPageNumber = get(this, 'currentPageNumber');
    var notLinkLabel = '...';
    var groups = []; // array of 8 numbers
    var labels = A([]);
    groups[0] = 1;
    groups[1] = Math.min(1, pagesCount);
    groups[6] = Math.max(1, pagesCount);
    groups[7] = pagesCount;
    groups[3] = Math.max(groups[1] + 1, currentPageNumber - 1);
    groups[4] = Math.min(groups[6] - 1, currentPageNumber + 1);
    groups[2] = Math.floor((groups[1] + groups[3]) / 2);
    groups[5] = Math.floor((groups[4] + groups[6]) / 2);

    for (let n = groups[0]; n <= groups[1]; n++) {
      labels[n] = n;
    }
    var userGroup2 = groups[4] >= groups[3] && ((groups[3] - groups[1]) > 1);
    if (userGroup2) {
      labels[groups[2]] = notLinkLabel;
    }
    for (let i = groups[3]; i <= groups[4]; i++) {
      labels[i] = i;
    }
    var userGroup5 = groups[4] >= groups[3] && ((groups[6] - groups[4]) > 1);
    if (userGroup5) {
      labels[groups[5]] = notLinkLabel;
    }
    for (let i = groups[6]; i <= groups[7]; i++) {
      labels[i] = i;
    }
    return A(labels.compact().map(label => { return {
      label: label,
      isLink: label !== notLinkLabel,
      isActive: label === currentPageNumber};
    }));
  }),

  /**
   * Are buttons "Back" and "First" enabled
   * @type {boolean}
   */
  gotoBackEnabled: computed.gt('currentPageNumber', 1),

  /**
   * Are buttons "Next" and "Last" enabled
   * @type {boolean}
   */
  gotoForwardEnabled: computed('currentPageNumber', 'pagesCount', function () {
    return get(this, 'currentPageNumber') < get(this, 'pagesCount');
  }),

  /**
   * @type {Ember.Object[]}
   */
  filteredContent: computed('filterString', 'data.[]', 'useFilteringByColumns', 'columns.@each.filterString', function () {
    var columns = get(this, 'columns');
    var filterString = get(this, 'filterString');
    var data = get(this, 'data');
    var useFilteringByColumns = get(this, 'useFilteringByColumns');
    var filteringIgnoreCase = get(this, 'filteringIgnoreCase');

    if (!data) {
      return [];
    }

    // global search
    var globalSearch = data.filter(function (row) {
      return columns.length ? columns.any(c => {
        var propertyName = get(c, 'propertyName');
        if (propertyName) {
          var cellValue = '' + get(row, get(c, 'propertyName'));
          if (filteringIgnoreCase) {
            cellValue = cellValue.toLowerCase();
            filterString = filterString.toLowerCase();
          }
          return cellValue.indexOf(filterString) !== -1;
        }
        return false;
      }) : true;
    });

    if (!useFilteringByColumns) {
      return globalSearch;
    }

    // search by each column
    return globalSearch.filter(row => {
      return columns.length ? columns.every(c => {
        var propertyName = get(c, 'propertyName');
        if (propertyName) {
          var cellValue = '' + get(row, get(c, 'propertyName'));
          if (get(c, 'useFilter')) {
            var filterString = get(c, 'filterString');
            if (filteringIgnoreCase) {
              cellValue = cellValue.toLowerCase();
              filterString = filterString.toLowerCase();
            }
            return cellValue.indexOf(filterString) !== -1;
          }
          return true;
        }
        return true;
      }) : true;
    });
  }),

  content: computed.alias('filteredContent'),

  /**
   * Content of the current table page
   * @type {Ember.Object[]}
   */
  visibleContent: computed('arrangedContent.[]', 'pageSize', 'currentPageNumber', function () {
    var arrangedContent = get(this, 'arrangedContent');
    var pageSize = get(this, 'pageSize');
    var currentPageNumber = get(this, 'currentPageNumber');
    var startIndex = pageSize * (currentPageNumber - 1);
    if (get(arrangedContent, 'length') < pageSize) {
      return arrangedContent;
    }
    return A(arrangedContent.slice(startIndex, startIndex + pageSize));
  }),

  /**
   * Real table summary
   * @use summaryTemplate
   * @type {string}
   */
  summary: computed('pageSize', 'currentPageNumber', 'arrangedContent.[]', function () {
    var currentPageNumber = get(this, 'currentPageNumber');
    var pageSize = get(this, 'pageSize');
    var arrangedContentLength = get(this, 'arrangedContent.length');
    var isLastPage = !get(this, 'gotoForwardEnabled');
    var firstIndex = arrangedContentLength === 0 ? 0 : pageSize * (currentPageNumber - 1) + 1;
    var lastIndex = isLastPage ? arrangedContentLength : currentPageNumber * pageSize;
    return fmt(get(this, 'messages.tableSummary'), firstIndex, lastIndex, arrangedContentLength);
  }),

  /**
   * List of possible <code>pageSize</code> values
   * Used to change size of <code>visibleContent</code>
   * @type {number[]}
   */
  pageSizeValues: A([10, 25, 50]),

  /**
   * Open first page if user has changed pageSize
   * @method pageSizeObserver
   */
  pageSizeObserver: observer('pageSize', function () {
    set(this, 'currentPageNumber', 1);
  }),

  /**
   * @method contentChangedAfterPolling
   */
  contentChangedAfterPolling () {
    get(this, 'filteredContent');
    this.notifyPropertyChange('filteredContent');
  },

  /**
   * Component init
   * Set visibility and filtering attributes for each column
   * Update messages used by table with user-provided messages (@see messages)
   * @method setup
   */
  setup: Ember.on('init', function() {
    this._setupColumns();
    this._setupMessages();
  }),

  /**
   * Create new properties for <code>columns</code> (filterString, useFilter, isVisible, defaultVisible)
   * @method _setupColumns
   * @private
   */
  _setupColumns () {
    get(this, 'columns').forEach(column => {
      if (isNone(get(column, 'filterString'))) {
        setProperties(column, {
          filterString: '',
          useFilter: !isNone(get(column, 'propertyName'))
        });
      }
      Ember.defineProperty(column, 'isVisible', computed.not('isHidden'));
      set(column, 'defaultVisible', !get(column, 'isHidden'));
    });

    var columns = get(this, 'columns');
    if (!columns.length) {
      return;
    }
    var self = this;
    columns.filter(column => {return !isNone(get(column, 'propertyName'));}).forEach(column => {
      var propertyName = get(column, 'propertyName');
      if (isNone(get(column, 'title'))) {
        set(column, 'title', S.capitalize(S.dasherize(propertyName).replace(/\-/g, ' ')));
      }
      self.addObserver('data.@each.' + propertyName, self, self.contentChangedAfterPolling);
    });
  },

  /**
   * Update messages used by widget with custom values provided by user in the <code>customMessages</code>
   * @method _setupMessages
   * @private
   */
  _setupMessages () {
    var newMessages = {};
    var customMessages = getWithDefault(this, 'customMessages', {});
    keys(customMessages).forEach(k => {
      set(newMessages, k, get(customMessages, k));
    });

    keys(defaultMessages).forEach(k => {
      if(isNone(get(newMessages, k))) {
        set(newMessages, k, get(defaultMessages, k));
      }
    });
    set(this, 'messages', Ember.Object.create(newMessages));
  },

  actions: {

    sendAction () {
      this.sendAction.apply(this, arguments);
    },

    toggleHidden (column) {
      column.toggleProperty('isHidden');
    },

    showAllColumns () {
      get(this, 'columns').setEach('isHidden', false);
    },

    hideAllColumns () {
      get(this, 'columns').setEach('isHidden', true);
    },

    restoreDefaultVisibility() {
      get(this, 'columns').forEach(c => {
        set(c, 'isHidden', !get(c, 'defaultVisible'));
      });
    },

    gotoFirst () {
      if (!get(this, 'gotoBackEnabled')) {
        return;
      }
      set(this, 'currentPageNumber', 1);
    },

    gotoPrev () {
      if (!get(this, 'gotoBackEnabled')) {
        return;
      }
      if (get(this, 'currentPageNumber') > 1) {
        this.decrementProperty('currentPageNumber');
      }
    },

    gotoNext () {
      if (!get(this, 'gotoForwardEnabled')) {
        return;
      }
      var currentPageNumber = get(this, 'currentPageNumber');
      var pageSize = get(this, 'pageSize');
      var arrangedContentLength = get(this, 'arrangedContent.length');
      if (arrangedContentLength > pageSize * (currentPageNumber - 1)) {
        this.incrementProperty('currentPageNumber');
      }
    },

    gotoLast () {
      if (!get(this, 'gotoForwardEnabled')) {
        return;
      }
      var pageSize = get(this, 'pageSize');
      var arrangedContentLength = get(this, 'arrangedContent.length');
      var pageNumber = arrangedContentLength / pageSize;
      pageNumber = (pageNumber % 1 === 0) ? pageNumber : (Math.floor(pageNumber) + 1);
      set(this, 'currentPageNumber', pageNumber);
    },

    gotoCustomPage (pageNumber) {
      set(this, 'currentPageNumber', pageNumber);
    },

    sort (column) {
      var sortProperties = get(this, 'sortProperties');
      var sortedBy = get(column, 'sortedBy') || get(column, 'propertyName');
      if (isNone(sortedBy)) {
        return;
      }
      if (sortProperties.indexOf(sortedBy) >= 0) {
        this.toggleProperty('sortAscending');
      }
      else {
        setProperties(this, {
          sortAscending: true,
          sortProperties: A([sortedBy])
        });
      }
      get(this, 'columns').forEach(column => {
        setProperties(column, {
          sortAsc: false,
          sortDesc: false
        });
      });
      setProperties(column, {
        sortAsc: get(this, 'sortAscending'),
        sortDesc: !get(this, 'sortAscending')
      });
    },

    changePageSize() {
      const selectedEl = this.$('.changePageSize')[0];
      const selectedIndex = selectedEl.selectedIndex;
      const pageSizeValues = this.get('pageSizeValues');
      const selectedValue = pageSizeValues[selectedIndex];
      this.set('pageSize', selectedValue);
    }

  }

});
