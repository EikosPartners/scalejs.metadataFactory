define([
    'scalejs!core',
    'knockout',
    'text!scalejs.metadataFactory/metadataFactory.html',
    'scalejs.metadataFactory/action/actionModule',
    'scalejs.mvvm'
    
], function (
    core,
    ko,
    view,
    avm
) {
    'use strict';

    core.mvvm.registerTemplates(view);
    
    var has = core.object.has,
        viewModels = {
            '': defaultViewModel,
            context: contextViewModel,
            action: avm.action
        },
        useDefault = true;
        
    function createViewModel(node) {
        //if(!this || !this.metadata) {
            //console.warn('Creating viewmodel without metadata context. If metadata context is desired, call this function using "this"');
        //}
        if (node && node.type === 'ignore' ) {
            console.log('ignored node ', node);
        } else {
            var mappedNode = viewModels[node.type] ? viewModels[node.type].call(this, node) : defaultViewModel.call(this, node);
            if (mappedNode) {
                mappedNode.type = mappedNode.type || node.type;
            }
            return mappedNode;
        }
    }

    function createViewModels(metadata) {
        var metadataContext;

        //if(!this || !this.metadata) {
            //console.warn('A new instance of metadata has been detected, therefore a new context will be created');
        //}

        // allows all viewmodels created in the same instane of metadata
        // to share context (as long as createViewModels is called correctly)
        if (this && this.metadata) {
            metadataContext = this;
        } else {
            metadataContext = {
                metadata: metadata
            };
        }

        return metadata.map(function (item) {
            return createViewModel.call(metadataContext, item)
        }).filter(function (vm) {
            // filter undefined or null from the viewmodels array
            return has(vm);
        });
    }

    function createTemplate(metadata) {
        if(!metadata) {
            return core.mvvm.template('metadata_loading_template');
        }
        if (!Array.isArray(metadata)) {
            metadata = [metadata];
        }

        var viewModels = createViewModels(metadata);

        return core.mvvm.template('metadata_items_template', viewModels);
    }

    function defaultViewModel(node) {
        if(!useDefault) {
            return;
        }
        return core.object.merge(node, {
            template: 'metadata_default_template'
        });
    }

    function contextViewModel(node) {
        core.object.extend(this, node);
    }

    function registerViewModels(newViewModels) {
        core.object.extend(viewModels, newViewModels);
    }

    function dispose(metadata) {
        // clean up clean up everybody everywhere
        ko.unwrap(metadata).forEach(function (node) {
            if(node.dispose) {
                node.dispose();
            }
            dispose(node.mappedChildNodes || []);
        })
    }

    ko.bindingHandlers.metadataFactory = {
        init: function () {
            return { controlsDescendantBindings: true };
        },
        update: function (
            element,
            valueAccessor,
            allBindings,
            viewModel,
            bindingContext
        ) {

            var metadata = ko.unwrap(valueAccessor()),
                prevMetadata;

            function disposeMetadata() {
                prevMetadata = ko.utils.domData.get(element, 'metadata');

                if (prevMetadata) {
                    prevMetadata = Array.isArray(prevMetadata) ? prevMetadata : [prevMetadata];
                    dispose(prevMetadata);
                }
            }


            setTimeout(function () {
                var metadataTemplate = createTemplate(metadata).template;

                disposeMetadata();

                ko.utils.domData.set(element,'metadata', metadataTemplate.data);

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
                    ko.utils.domNodeDisposal.addDisposeCallback(element, function() {
                        disposeMetadata();
                    });
                }
            });
        }

    }
    var metadatafactory = { metadataFactory: {
            createTemplate: createTemplate,
            registerViewModels: registerViewModels,
            createViewModels: createViewModels,
            createViewModel: createViewModel,
            useDefault: useDefault,
            registerAction : avm.registerAction,
            registerActions: avm.registerActions,
            getRegisteredActions: avm.getRegisteredActions
    }};
    
    core.registerExtension(metadatafactory);
    return metadatafactory;
});