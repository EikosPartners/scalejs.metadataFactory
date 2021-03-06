import { registerTemplates, registerBindings, getRegisteredTemplates, template } from 'scalejs.mvvm';
import {observable, observableArray, computed} from 'knockout';
import * as noticeboard from 'scalejs.noticeboard';
import ko from 'knockout';
import _ from 'lodash';

import view from './views/metadataFactory.html';
import moment from 'moment';
import { evaluate } from 'scalejs.expression-jsep';

import { get, is, has, merge } from 'scalejs';
registerTemplates(view);

var viewModels = {
        '': defaultViewModel,
        context: contextViewModel
    },
    globalMetadata = observable({}),
    schemas = {

    },
    identifiers = {},
    useDefault = true;


function createViewModel(node) {
    var rendered = observable(true),
        context = this;

    node = _.cloneDeep(node); //clone the node to stop mutation issues

    // if(!this || !this.metadata) {
    //     console.warn('Creating viewmodel without metadata context. If metadata context is desired, call this function using "this"');
    // }
    if (node && node.type === 'ignore') {
        console.log('ignored node ', node);
    } else {
        var mappedNode;
        if (viewModels[node.type]) {
            mappedNode = viewModels[node.type].call(this, node);
        } else {
            console.log('no viewModel of type ' + node.type + ' was found')
            mappedNode = defaultViewModel.call(this, node);
        }

        if (mappedNode && has(node.rendered)) {
            let renderedExp = node.rendered;

            rendered = is(node.rendered, 'boolean') ? observable(node.rendered) : computed(function () {
                return evaluate(renderedExp, function (id) {
                    if (context.getValue && has(context.getValue(id))) {
                        return context.getValue(id);
                    }
                    //if (id === 'role') {
                    //    return core.userservice.role();
                    //}
                    return '';
                })
            });
        }
        if (mappedNode) {
            mappedNode.type = mappedNode.type || node.type;
            mappedNode.rendered = rendered;
        }
        return mappedNode;
    }
}

function createViewModels(metadata) {
    var metadataContext;
    // allows all viewmodels created in the same instane of metadata
    // to share context (as long as createViewModels is called correctly)
    if (this && this.metadata) {
        metadataContext = this;
    } else {
        metadataContext = {
            metadata: metadata,
            // default getValue can grab from the store
            getValue: function (id) {
                if (id === 'store' && noticeboard.dictionary) {
                    return ko.unwrap(noticeboard.dictionary);
                }
                if (id === '_') {
                    return _;
                }
                if (id == 'Date') {
                    return function (d) {
                        return moment(d).toDate().getTime();
                    }
                }
                if (id === 'currentDateUTC') {
                    return moment.utc().format();
                }
                if (id == 'IncrementDate') {
                    return function (d, t, s) {
                        return moment(d).add(t, s).toDate().getTime();
                    }
                }
                return identifiers[id];
            }
        };
    }

    return metadata.map(function (item) {
        return createViewModel.call(metadataContext, item)
    }).filter(function (vm) {
        // filter undefined or null from the viewmodels array
        return has(vm);
    });
}

function createTemplate(metadata, context) {
    if (!metadata) {
        return template('metadata_loading_template');
    }
    if (!Array.isArray(metadata)) {
        metadata = [metadata];
    }

    var viewModels = !context ? createViewModels(metadata) : createViewModels.call(context, metadata);

    return template('metadata_items_template', viewModels);
}

function defaultViewModel(node) {
    if (!useDefault) {
        return;
    }
    return merge(node, {
        template: 'metadata_default_template'
    });
}

function contextViewModel(node) {
    var newContextProps = {};
    Object.keys(node).forEach(function (prop) {
        if (prop === 'type') {
            return;
        }
        if (Array.isArray(node[prop])) {
            newContextProps[prop] = observableArray(node[prop]);
        } else {
            newContextProps[prop] = observable(node[prop]);
        }
    });
    _.extend(this, newContextProps);
}

function registerViewModels(newViewModels) {
    _.extend(viewModels, newViewModels);
}

function getRegisteredTypes() {
    return Object.keys(viewModels);
}

function registerIdentifiers(ids) {
    _.extend(identifiers, ids);
}

function dispose(metadata) {
    // clean up clean up everybody everywhere
    ko.unwrap(metadata).forEach(function (node) {
        if (node.dispose) {
            node.dispose();
        }
        dispose(node.mappedChildNodes || []);
    })
}

function registerSchema(schema) {
    for (var key in schema) {
        // if( schemas.hasOwnProperty(key) ){
        if (key !== '') {
            schemas[key] = schema[key];
        }
    }
}

function generateSchema() {

    //Basic schema layout for pjson
    var schema = {
        '$schema': 'http://json-schema.org/draft-04/schema#',
        'definitions': {
            'template': {
                'type': 'string'
            },
            'type': {
                'type': 'string'
            },
            'templateExt': {
                'oneOf': [
                    // case where no template is provided
                    {
                        'not': {
                            'required': ['template']
                        }
                    }
                ]
            },
            'typeExt': {
                'oneOf': []
            },
            'children': {
                'type': 'array',
                'items': {
                    '$ref': '#/definitions/subObject'
                }
            },
            'options': {
                'type': 'object'
            },
            'classes': {
                'type': 'string'
            },
            'subObject': {
                'allOf': [{
                    // Base properties
                    'type': 'object',
                    'properties': {
                        'template': {}, // makes sure template/type show up as options
                        'type': {},
                        'children': {
                            '$ref': '#/definitions/children'
                        },
                        'options': {
                            '$ref': '#/definitions/options'
                        }
                    },
                    'required': ['type']
                },
                    // populates templates, types, and corresponding options
                    {
                        '$ref': '#/definitions/typeExt'
                    }, {
                        '$ref': '#/definitions/templateExt'
                    }
                ]
            }
        },
        'oneOf': [{
            '$ref': '#/definitions/subObject'
        }, {
                'type': 'array',
                'items': {
                    '$ref': '#/definitions/subObject'
                }
            }]
    };

    //Add all templates to the schema
    var option;
    var otherTemplates = [];
    for (var key in getRegisteredTemplates()) {
        if (key !== '') {
            if (schemas.hasOwnProperty(key)) {
                // Add extended templates
                option = {
                    'properties': {
                        'template': {
                            'enum': [key]
                        },
                        'options': {
                            'type': 'object',
                            'properties': schemas[key]
                        }
                    },
                    'required': ['template'] // ensures matching template
                }
                schema.definitions.templateExt.oneOf.push(option);
            } else {
                otherTemplates.push(key);
            }
        }
    }
    if (otherTemplates.length > 0) {
        // Add regular templates
        schema.definitions.template.enum = otherTemplates;
        option = {
            'properties': {
                'template': {
                    '$ref': '#/definitions/template'
                }
            },
            'required': ['template'] // ensures matching template
        }
        schema.definitions.templateExt.oneOf.push(option);
    }

    //Add all types to the schema
    var otherTypes = [];
    for (var key in viewModels) {
        if (key !== '') {
            if (schemas.hasOwnProperty(key + '_template')) {
                // Add extended types
                var option = {
                    'properties': {
                        'type': {
                            'enum': [key]
                        },
                        'options': {
                            'type': 'object',
                            'properties': schemas[key + '_template']
                        }
                    }
                }
                schema.definitions.typeExt.oneOf.push(option);
            } else {
                otherTypes.push(key);
            }
        }
    }
    if (otherTypes.length > 0) {
        // Add regular types
        schema.definitions.type.enum = otherTypes;
        option = {
            'properties': {
                'type': {
                    '$ref': '#/definitions/type'
                }
            }
        }
        schema.definitions.typeExt.oneOf.push(option);
    }

    return schema;

}

ko.bindingHandlers.metadataSync = {}; // optional for MD factory

ko.bindingHandlers.metadataFactory = {
    init: function () {
        return {
            controlsDescendantBindings: true
        };
    },
    update: function (
        element,
        valueAccessor,
        allBindings,
        viewModel,
        bindingContext
    ) {


        var value = ko.unwrap(valueAccessor()) || {};

        var metadata = value.metadata ? value.metadata : value,
            sync = allBindings().metadataSync,
            context = value.context ? value.context : null,
            prevMetadata;

        function disposeMetadata() {
            prevMetadata = ko.utils.domData.get(element, 'metadata');

            if (prevMetadata) {
                prevMetadata = Array.isArray(prevMetadata) ? prevMetadata : [prevMetadata];
                dispose(prevMetadata);
            }
        }

        function applyMetadataBinding() {
            disposeMetadata();
            var metadataTemplate = createTemplate(metadata, context).template;

            ko.utils.domData.set(element, 'metadata', metadataTemplate.data);

            ko.bindingHandlers.template.update(
                element,
                function () {
                    return metadataTemplate;
                },
                allBindings,
                viewModel,
                bindingContext
            );

            // first time running - set dom node disposal
            if (!prevMetadata) {
                ko.utils.domNodeDisposal.addDisposeCallback(element, function () {
                    disposeMetadata();
                });
            }
        }

        if (sync) {
            ko.ignoreDependencies(applyMetadataBinding);
        } else {
            setTimeout(applyMetadataBinding);
        }
    }

}

export {
    createTemplate,
    registerViewModels,
    createViewModels,
    createViewModel,
    useDefault,
    registerIdentifiers,
    getRegisteredTypes,
    globalMetadata
}
