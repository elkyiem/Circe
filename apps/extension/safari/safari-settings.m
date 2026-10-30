//
//  safari-settings.m
//  Opens Safari's settings at Pond's extension, from Pond's main process.
//
//  There is no URL scheme for this: "prefs:extensions" is unhandled
//  (kLSApplicationNotFoundErr) and "x-apple.systempreferences:com.apple.Safari-Settings.extension"
//  lands on the wrong pane. SFSafariApplication is the only supported entry point, and Safari
//  answers it only for the main process of the app that contains the extension. A helper
//  executable gets SFErrorDomain error 1 from anywhere in the bundle, so this is a Node-API
//  module that Electron's main process loads.
//
//  Exports showPreferences(identifier: string): Promise<void>, which rejects with Safari's
//  error. Built by build-safari-extension.mjs into Pond.app/Contents/Resources.
//

#import <Foundation/Foundation.h>
#import <SafariServices/SafariServices.h>
#include <node_api.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    napi_deferred deferred;
    napi_threadsafe_function settle;
    /** Safari's error message, or NULL when it opened the settings. */
    char *error;
} Request;

/** Runs on the JS thread; Safari calls back on a queue of its own. */
static void Settle(napi_env env, napi_value callback, void *context, void *data) {
    Request *request = data;
    if (env != NULL) {
        if (request->error != NULL) {
            napi_value message, error;
            napi_create_string_utf8(env, request->error, NAPI_AUTO_LENGTH, &message);
            napi_create_error(env, NULL, message, &error);
            napi_reject_deferred(env, request->deferred, error);
        } else {
            napi_value undefined;
            napi_get_undefined(env, &undefined);
            napi_resolve_deferred(env, request->deferred, undefined);
        }
    }
    napi_release_threadsafe_function(request->settle, napi_tsfn_release);
    free(request->error);
    free(request);
}

static napi_value ShowPreferences(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);

    size_t length = 0;
    if (argc < 1 || napi_get_value_string_utf8(env, argv[0], NULL, 0, &length) != napi_ok) {
        napi_throw_type_error(env, NULL, "showPreferences takes an extension identifier");
        return NULL;
    }
    char *identifier = malloc(length + 1);
    napi_get_value_string_utf8(env, argv[0], identifier, length + 1, &length);

    Request *request = calloc(1, sizeof(Request));
    napi_value promise, name;
    napi_create_promise(env, &request->deferred, &promise);
    napi_create_string_utf8(env, "showPreferences", NAPI_AUTO_LENGTH, &name);
    napi_create_threadsafe_function(env, NULL, NULL, name, 0, 1, NULL, NULL, NULL, Settle,
                                    &request->settle);

    NSString *extension = [NSString stringWithUTF8String:identifier];
    free(identifier);
    [SFSafariApplication showPreferencesForExtensionWithIdentifier:extension
                                                 completionHandler:^(NSError *error) {
        if (error != nil) {
            const char *message = error.localizedDescription.UTF8String;
            request->error = strdup(message != NULL ? message : "Safari refused the request");
        }
        napi_call_threadsafe_function(request->settle, request, napi_tsfn_blocking);
    }];
    return promise;
}

NAPI_MODULE_INIT() {
    napi_value function;
    napi_create_function(env, "showPreferences", NAPI_AUTO_LENGTH, ShowPreferences, NULL,
                         &function);
    napi_set_named_property(env, exports, "showPreferences", function);
    return exports;
}
