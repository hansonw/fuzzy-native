#include <nan.h>
#include <vector>
#include <unordered_map>
#include <chrono>

#include "MatcherBase.h"

using namespace Nan;

#define CHECK(cond, msg)                                                       \
  if (!(cond)) {                                                               \
    ThrowTypeError(msg);                                                       \
    return;                                                                    \
  }

template <typename T>
T get_property(const v8::Local<v8::Object> &object, const char *name) {
  auto prop = Nan::Get(object, Nan::New(name).ToLocalChecked());
  if (prop.IsEmpty()) {
    return T();
  }
  Nan::Maybe<T> result = Nan::To<T>(prop.ToLocalChecked());
  if (result.IsNothing()) {
    return T();
  }
  return result.FromJust();
}

/**
 * This saves one string copy over using v8::String::Utf8Value.
 */
std::string to_std_string(const v8::Local<v8::String> &v8str) {
  v8::Isolate *isolate = v8::Isolate::GetCurrent();
  std::string str(v8str->Utf8Length(isolate), ' ');
  v8str->WriteUtf8(isolate, &str[0]);
  return str;
}

std::string get_string_property(const v8::Local<v8::Object> &object,
                                const char *name) {
  auto prop =
    Nan::Get(object, Nan::New(name).ToLocalChecked());
  if (!prop.IsEmpty()) {
    auto propLocal = prop.ToLocalChecked();
    if (propLocal->IsNull() || propLocal->IsUndefined()) {
      return std::string("");
    }
    if (!propLocal->IsString()) {
      std::string msg =
        std::string("property ") +
        name +
        std::string(" must be a string");
      ThrowTypeError(msg.c_str());
    }

    return to_std_string(Nan::To<v8::String>(propLocal).ToLocalChecked());
  }
  return std::string("");
}

Persistent<v8::Function> MatcherConstructor;

class Matcher : public ObjectWrap {
public:
  static void Init(v8::Local<v8::Object> exports) {
    // Prepare constructor template
    v8::Local<v8::FunctionTemplate> tpl =
        New<v8::FunctionTemplate>(Matcher::Create);
    tpl->SetClassName(New("Matcher").ToLocalChecked());
    tpl->InstanceTemplate()->SetInternalFieldCount(1);

    // Prototype
    SetPrototypeMethod(tpl, "match", Match);
    SetPrototypeMethod(tpl, "addCandidates", AddCandidates);
    SetPrototypeMethod(tpl, "removeCandidates", RemoveCandidates);
    SetPrototypeMethod(tpl, "setCandidates", SetCandidates);

    v8::Local<v8::Context> context = Nan::GetCurrentContext();

    MatcherConstructor.Reset(tpl->GetFunction(context).ToLocalChecked());
    Set(exports, Nan::New("Matcher").ToLocalChecked(), tpl->GetFunction(context).ToLocalChecked());
  }

  static void Create(const Nan::FunctionCallbackInfo<v8::Value> &info) {
    CHECK(info.IsConstructCall(), "Use 'new' to construct Matcher");
    auto obj = new Matcher();
    obj->Wrap(info.This());
    AddCandidates(info);
    info.GetReturnValue().Set(info.This());
  }

  static void Match(const FunctionCallbackInfo<v8::Value> &info) {
    if (info.Length() < 1) {
      Nan::ThrowTypeError("Wrong number of arguments");
      return;
    }

    CHECK(info[0]->IsString(), "First argument should be a query string");
    std::string query(to_std_string(Nan::To<v8::String>(info[0]).ToLocalChecked()));

    MatcherOptions options;
    if (info.Length() > 1) {
      CHECK(info[1]->IsObject(), "Second argument should be an options object");
      auto options_obj = Nan::To<v8::Object>(info[1]).ToLocalChecked();
      options.case_sensitive = get_property<bool>(options_obj, "caseSensitive");
      options.smart_case = get_property<bool>(options_obj, "smartCase");
      options.num_threads = get_property<int>(options_obj, "numThreads");
      options.max_results = get_property<int>(options_obj, "maxResults");
      options.max_gap = get_property<int>(options_obj, "maxGap");
      options.record_match_indexes =
          get_property<bool>(options_obj, "recordMatchIndexes");
      options.root_path = get_string_property(options_obj, "rootPath");
    }

    auto idKey = New("id").ToLocalChecked();
    auto valueKey = New("value").ToLocalChecked();
    auto scoreKey = New("score").ToLocalChecked();
    auto matchIndexesKey = New("matchIndexes").ToLocalChecked();

    auto matcher = Unwrap<Matcher>(info.This());
    std::vector<MatchResult> matches =
        matcher->impl_.findMatches(query, options);
    auto result = New<v8::Array>();
    size_t result_count = 0;
    for (const auto &match : matches) {
      auto obj = New<v8::Object>();
      Set(obj, idKey, New<v8::Uint32>(match.id));
      Set(obj, scoreKey, New(match.score));
      Set(obj, valueKey, New(*match.value).ToLocalChecked());
      if (match.matchIndexes != nullptr) {
        auto array = New<v8::Array>(match.matchIndexes->size());
        for (size_t i = 0; i < array->Length(); i++) {
          array->Set(i, New(match.matchIndexes->at(i)));
        }
        Set(obj, matchIndexesKey, array);
      }
      result->Set(result_count++, obj);
    }
    info.GetReturnValue().Set(result);
  }

  static void AddCandidates(const FunctionCallbackInfo<v8::Value> &info) {
    auto matcher = Unwrap<Matcher>(info.This());
    if (info.Length() > 0) {
      CHECK(info[0]->IsArray(), "Expected an array of unsigned 32-bit integer ids as the first argument");
      CHECK(info[1]->IsArray(), "Expected an array of strings as the second argument");

      auto ids = v8::Local<v8::Array>::Cast(info[0]);
      auto values = v8::Local<v8::Array>::Cast(info[1]);

      CHECK(ids->Length() == values->Length(), "Expected ids array and values array to have the same length");

      // Create a random permutation so that candidates are shuffled.
      std::vector<size_t> indexes(ids->Length());
      for (size_t i = 0; i < indexes.size(); i++) {
        indexes[i] = i;
        if (i > 0) {
          std::swap(indexes[rand() % i], indexes[i]);
        }
      }
      matcher->impl_.reserve(matcher->impl_.size() + ids->Length());
      for (auto i: indexes) {
        auto id_value = ids->Get(i);
        CHECK(id_value->IsUint32(), "Expected first array to only contain unsigned 32-bit integer ids");
        auto id = v8::Local<v8::Uint32>::Cast(id_value)->Value();
        auto value = to_std_string(Nan::To<v8::String>(values->Get(i)).ToLocalChecked());
        matcher->impl_.addCandidate(id, value);
      }
    }
  }

  static void RemoveCandidates(const FunctionCallbackInfo<v8::Value> &info) {
    auto matcher = Unwrap<Matcher>(info.This());
    if (info.Length() > 0) {
      CHECK(info[0]->IsArray(), "Expected an array of unsigned 32-bit integer ids");
      auto ids = v8::Local<v8::Array>::Cast(info[0]);
      for (size_t i = 0; i < ids->Length(); i++) {
        auto id_value = ids->Get(i);
        CHECK(id_value->IsUint32(), "Expected array to only contain unsigned 32-bit integer ids");
        auto id = v8::Local<v8::Uint32>::Cast(id_value)->Value();
        matcher->impl_.removeCandidate(id);
      }
    }
  }

  static void SetCandidates(const FunctionCallbackInfo<v8::Value> &info) {
    auto matcher = Unwrap<Matcher>(info.This());
    matcher->impl_.clear();
    AddCandidates(info);
  }

private:
  MatcherBase impl_;
};

void Init(v8::Local<v8::Object> exports) { Matcher::Init(exports); }

NODE_MODULE(addon, Init)
