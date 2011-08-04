
$(function() {

    var EditingToolsRuoter = Backbone.View.extend({

        initialize: function() {
            _.bindAll(this, 'change_state', 'new_polygon', 'reset');
            this.state = 'move';
            this.app = this.options.app;
            this.app.polygon_tools.bind('state', this.change_state);
        },

        new_polygon: function(data) {
            //this.app.cell_polygons.polygons.create(data);
            var p = new Polygon(data);
            this.app.cell_polygons.polygons.add(p);
            window.loading_small.loading('saving poly');
            p.save(null, {
                success: function() {
                    window.loading_small.finished('saving poly');
                }
            });
        },

        //reset to initial state
        reset: function() {
            this.app.ndfi_layer.unbind('polygon', this.new_polygon);
            this.app.create_polygon_tool.unbind('polygon', this.new_polygon);
            this.app.ndfi_layer.editing_state = false;
            this.app.cell_polygons.editing_state = false;
            this.app.create_polygon_tool.editing_state(false);
            this.app.polygon_tools.polytype.hide();
            //this.app.map.$("canvas").css('cursor','auto');
            this.app.cell_polygons.unbind('click_on_polygon', this.app.create_polygon_tool.edit_polygon);
            this.app.map.map.setOptions({draggableCursor: 'default'});
        },

        editing_mode: function() {
            this.app.cell_polygons.bind('click_on_polygon', this.app.create_polygon_tool.edit_polygon);
        },

        change_state: function(st) {
            if(st == this.state) {
                return;
            }
            this.state = st;
            this.reset();
            this.app.map.map.setOptions({draggableCursor: 'url(/static/img/cursor_' + st +'.png) 0 15, default'});
            switch(st) {
                case 'edit':
                    this.editing_mode();
                    break;
                case 'remove':
                    this.app.cell_polygons.editing_state = true;
                    break;
                case 'draw':
                    this.app.create_polygon_tool.editing_state(true);
                    this.app.polygon_tools.polytype.bind('state', this.app.create_polygon_tool.poly_type);
                    this.app.create_polygon_tool.bind('polygon', this.new_polygon);
                    this.app.polygon_tools.polytype.show();
                    this.app.polygon_tools.polytype.select('def');
                    break;
                case 'auto':
                    this.app.ndfi_layer.bind('polygon', this.new_polygon);
                    this.app.ndfi_layer.editing_state = true;
                    //this.app.map.$("canvas").css('cursor','crosshair');
                    break;
            }
            console.log(st);
        }

    });

    var Rutes = Backbone.Router.extend({
      routes: {
        "cell/:z/:x/:y":   "cell"
      },
      cell: function(z, x, y) {
        //console.log(z, x, y);
      }
    });

    var router = new Rutes();

    // application
    var IMazon = Backbone.View.extend({

        el: $('body'),


        amazon_bounds: new google.maps.LatLngBounds(
            new google.maps.LatLng(-18.47960905583197, -74.0478515625),
            new google.maps.LatLng(5.462895560209557, -43.43994140625)
        ),

        initialize:function() {
            _.bindAll(this, 'to_cell', 'start', 'select_mode', 'work_mode', 'change_report', 'compare_view', 'update_map_layers', 'cell_done', 'go_back', 'open_notes', 'change_cell', 'close_report');

            window.loading.loading("Imazon:initialize");
            this.reports = new ReportCollection();
            this.compare_layout = null;

            this.map = new MapView({el: this.$("#main_map")});
            this.map.hide_controls();
            this.cell_polygons = new CellPolygons({mapview: this.map});

            this.reports.bind('reset', this.change_report);
            this.map.bind('ready', this.start);
            this.available_layers = new LayerCollection();
            this.available_layers.bind('reset', this.update_map_layers);
        },

        init_ui: function() {
            this.selection_toolbar = new ReportToolbar({report:this.active_report});
            this.polygon_tools = new PolygonToolbar();
            this.overview = new Overview({report: this.active_report});


            this.ndfi_layer = new NDFILayer({mapview: this.map, report: this.active_report});
    

            this.polygon_tools.ndfi_range.bind('change', this.ndfi_layer.apply_filter);
            // don't change cell model every slider movement, only when the it stops
            this.polygon_tools.ndfi_range.bind('stop', this.change_cell);
            this.polygon_tools.compare.bind('state', this.compare_view);
            this.overview.bind('go_back', this.go_back);
            this.overview.bind('open_notes', this.open_notes);
            this.overview.bind('done', this.cell_done);
            this.overview.bind('close_report', this.close_report);
            this.user.bind('change:current_cells', this.overview.change_user_cells);
            this.overview.change_user_cells(this.user, this.user.get('current_cells'));
            this.ndfi_layer.bind('map_error', function() {
                show_error("Not enough data available to generate map for this report. After the latest report is generated, map images can take some time to appear.");
            });

        },

        change_cell: function(low, high) {
            var cell = this.gridstack.current_cell;
            cell.set({
                'ndfi_low': low/200.0,
                'ndfi_high': high/200.0
            });
            cell.save();
        },

        update_map_layers: function() {
            //update here other maps
        },

        compare_four: function() {
              this.map.el.css({width: '66.66%'});
              this.map.adjustSize();
              this.compare_layout = this.$("#compare_layout_1").show();
              this.compare_maps = [];
              this.compare_maps.push(new MapView({el: this.$("#map1")}));
              this.compare_maps.push(new MapView({el: this.$("#map2")}));
              this.compare_maps.push(new MapView({el: this.$("#map3")}));
        },

        compare_two: function() {
              this.map.el.css({width: '50%'});
              this.map.adjustSize();
              this.compare_layout = this.$("#compare_layout_2").show();
              this.compare_maps = [];
              this.compare_maps.push(new MapView({el: this.$("#map_half")}));
        },


        compare_view: function(compare_type) {
            var self = this;
            if(compare_type !== 'one') {
                if(this.compare_layout !== null) {
                    this.compare_view('one');
                }
                // el gran putiferio
                if(compare_type === 'two') {
                    this.compare_two();
                } else {
                    this.compare_four();
                }
                _.each(this.compare_maps, function(m) {
                    m.map.setZoom(self.map.map.getZoom());
                    m.map.setCenter(self.map.map.getCenter());
                    self.map.bind('center_changed', m.set_center_silence);
                    m.bind('center_changed', self.map.set_center_silence);
                    m.layers.reset(self.available_layers.toJSON());
                    _.each(self.compare_maps, function(other) {
                        if(other !== m) {
                            m.bind('center_changed', other.set_center_silence);
                        }
                    });
                });
            } else {
                this.map.el.css({width: '100%'});
                this.map.adjustSize();
                if(this.compare_layout !== null) {
                    this.compare_layout.hide();
                    this.compare_layout = null;
                }
                _.each(this.compare_maps, function(m) {
                    // unbind!
                    self.map.unbind('center_changed', m.set_center_silence);
                    m.unbind('center_changed', self.map.set_center_silence);
                    _.each(self.compare_maps, function(other) {
                        if(other !== m) {
                            m.unbind('center_changed', other.set_center_silence);
                        }
                    });
                    // flybye!
                    delete m.map;
                    delete m;
                });
                this.compare_maps = [];
            }
        },

        change_report: function() {
            this.active_report = this.reports.models[0];
            this.cell_polygons.polygons.report = this.active_report;
            this.cell_polygons.polygons.fetch();
        },


        // entering on work mode
        work_mode: function(x, y, z) {
            this.selection_toolbar.hide();
            this.polygon_tools.show();
            this.ndfi_layer.show();
            this.map.show_zoom_control();
            this.map.show_layers_control();

            //update slider with current cell values
            var cell = this.gridstack.current_cell;
            this.polygon_tools.ndfi_range.set_values(cell.get('ndfi_low'), cell.get('ndfi_high'));
            //cell done!
            this.overview.set_note_count(this.gridstack.current_cell.get('note_count'));
            this.cell_polygons.polygons.x = x;
            this.cell_polygons.polygons.y = y;
            this.cell_polygons.polygons.z = z;
            this.cell_polygons.polygons.fetch();

            this.editing_router = new EditingToolsRuoter({
                app: this
            });
        },

        cell_done: function() {
            var cell = this.gridstack.current_cell;
            if(!cell.get('done')) {
                this.user.inc_cells();
            }
            cell.set({'done': true});
            cell.save();
            // got to parent cell
            this.go_back();
            // cells count must be updated
            this.active_report.fetch();
        },

        go_back: function() {
            var p = this.gridstack.current_cell.parent_cell();
            this.to_cell(p.get('z'), p.get('x'), p.get('y'));
            router.navigate('cell/' +  p.get('z') + "/" + p.get('x') + "/" + p.get('y'));
        },

        // entering on select_mode
        select_mode: function() {
            this.map.hide_zoom_control();
            this.compare_view('one');
            this.selection_toolbar.show();
            this.polygon_tools.hide();
            this.ndfi_layer.hide();
            this.overview.select_mode();
            this.cell_polygons.polygons.reset();
            if(this.editing_router) {
                //unbind all
                this.editing_router.reset();
                this.polygon_tools.reset();
                delete this.editing_router;
            }
        },

        // this function is called when map is loaded
        // and all stuff can start to work.
        // do *NOT* perform any operation over map before this function
        // is called
        start: function() {
            var self = this;

            this.create_polygon_tool = new  PolygonDrawTool({mapview: this.map});

            // grid manager
            this.gridstack = new GridStack({
                mapview: this.map,
                el: $("#grid"),
                initial_bounds: this.amazon_bounds,
                report: this.active_report
            });

            // bindings
            this.gridstack.grid.bind('enter_cell', function(cell) {
                self.overview.on_cell(cell.get('x'), cell.get('y'), cell.get('z'));
                router.navigate('cell/' +  cell.get('z') + "/" + cell.get('x') + "/" + cell.get('y'));
            });
            router.bind('route:cell', this.to_cell);
            this.gridstack.bind('select_mode', this.select_mode);
            this.gridstack.bind('work_mode', this.work_mode);

            // init interface elements
            this.init_ui();

            // init the map
            this.map.map.setCenter(this.amazon_bounds.getCenter());
            this.map.layers.reset(this.available_layers.models);
            // enable layer, amazonas bounds
            this.map.layers.models[0].set_enabled(true);
            //this.map.change_layer(this.map.layers.models[0]);

            if(location.hash === '') {
                router.navigate('cell/0/0/0');
            }
            Backbone.history.start();
            window.loading.finished("Imazon: start");
            console.log(" === App started === ");
        },

        to_cell:function (z, x, y) {
            this.overview.on_cell(x, y, z);
            this.gridstack.enter_cell(parseInt(x, 10), parseInt(y, 10), parseInt(z, 10));
        },

        open_notes: function() {
            var self = this;
            if(self.notes_dialog === undefined) {
                self.notes_dialog = new NotesDialog({
                    el: this.$(".mamufas"),
                    cell: this.gridstack.current_cell
                });
                self.notes_dialog.notes.bind('add', function(note, notes) {
                    self.overview.set_note_count(notes.models.length);
                });
            } else {
                self.notes_dialog.set_cell(this.gridstack.current_cell);
            }
            self.notes_dialog.open();
        },

        close_report: function() {
            window.loading.loading();
            $.ajax({
              type: 'POST',
              url: '/api/v0/report/' + this.active_report.get('id') + "/close",
              success: function() {
                window.location.reload();
              },
              error: function() {
                show_error('There was a problem closing report, try it later');
                window.loading.finish();
              }
            });

        }


    });

    window.loading = new Loading();
    window.loading_small = new LoadingSmall();
    var bb_sync = Backbone.sync;
    // avoid cached GET
    /*Backbone.sync = function(method, model, options) {
        window.loading_small.loading();
        var s = options.success;
        var e = options.error;
        var success = function(resp, status, xhr) {
            window.loading_small.finished();
            if(s) {
                s(resp, status, xhr);
            }
        };
        var error = function(resp, status, xhr) {
            window.loading_small.finished();
            if(e) {
                e.error(resp, status, xhr);
            }
        };
        options.success = success;
        options.error = error;
        bb_sync(method, model, options);
    };*/
    $.ajaxSetup({ cache: false });
    //setup global object to centralize all projection operations
    window.mapper = new Mapper();
    window.app = new IMazon();


});
