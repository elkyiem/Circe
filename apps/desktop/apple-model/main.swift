/** Runs one Fish turn on Apple's on-device model; see apps/desktop/src/main/core/agent/apple-runtime.ts for the protocol. */
import Foundation
import FoundationModels

final class SchemaNode: Decodable, @unchecked Sendable {
    let kind: String
    let name: String?
    let description: String?
    let choices: [String]?
    let variants: [SchemaNode]?
    let properties: [PropertyNode]?
    let items: SchemaNode?
    let max: Int?

    init(kind: String) {
        self.kind = kind
        name = nil
        description = nil
        choices = nil
        variants = nil
        properties = nil
        items = nil
        max = nil
    }
}

struct PropertyNode: Decodable {
    let name: String
    let description: String?
    let optional: Bool
    let schema: SchemaNode
}

struct Request: Decodable {
    let command: String
    let instructions: String?
    let prompt: String?
    let schema: SchemaNode?
}

func emit(_ object: [String: Any]) -> Never {
    let data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data(#"{"ok":false,"error":"failed"}"#.utf8)
    FileHandle.standardOutput.write(data)
    exit(0)
}

@available(macOS 26.0, *)
func build(_ node: SchemaNode) -> DynamicGenerationSchema {
    switch node.kind {
    case "object":
        return DynamicGenerationSchema(
            name: node.name ?? "Object",
            description: node.description,
            properties: (node.properties ?? []).map {
                DynamicGenerationSchema.Property(
                    name: $0.name,
                    description: $0.description,
                    schema: build($0.schema),
                    isOptional: $0.optional
                )
            }
        )
    case "choice":
        return DynamicGenerationSchema(name: node.name ?? "Choice", description: node.description, anyOf: node.choices ?? [])
    case "anyOf":
        return DynamicGenerationSchema(name: node.name ?? "Union", description: node.description, anyOf: (node.variants ?? []).map(build))
    case "array":
        return DynamicGenerationSchema(arrayOf: build(node.items ?? SchemaNode(kind: "string")), maximumElements: node.max)
    case "integer":
        return DynamicGenerationSchema(type: Int.self)
    case "number":
        return DynamicGenerationSchema(type: Double.self)
    case "boolean":
        return DynamicGenerationSchema(type: Bool.self)
    default:
        return DynamicGenerationSchema(type: String.self)
    }
}

@available(macOS 26.0, *)
func unavailableReason(_ model: SystemLanguageModel) -> String? {
    switch model.availability {
    case .available: return nil
    case .unavailable(.deviceNotEligible): return "deviceNotEligible"
    case .unavailable(.appleIntelligenceNotEnabled): return "appleIntelligenceNotEnabled"
    case .unavailable(.modelNotReady): return "modelNotReady"
    case .unavailable: return "unavailable"
    }
}

@available(macOS 26.0, *)
func run(_ request: Request) async -> Never {
    let model = SystemLanguageModel.default
    if let reason = unavailableReason(model) {
        emit(["ok": false, "error": reason])
    }
    switch request.command {
    case "status":
        emit(["ok": true, "contextSize": model.contextSize])
    case "count":
        guard #available(macOS 26.4, *), let root = request.schema else {
            emit(["ok": false, "error": "unsupported"])
        }
        do {
            let schema = try GenerationSchema(root: build(root), dependencies: [])
            let tokens = try await model.tokenCount(for: Instructions(request.instructions ?? ""))
                + model.tokenCount(for: Prompt(request.prompt ?? ""))
                + model.tokenCount(for: schema)
            emit(["ok": true, "tokens": tokens, "contextSize": model.contextSize])
        } catch {
            emit(["ok": false, "error": "failed", "message": "\(error)"])
        }
    case "generate":
        guard let root = request.schema else { emit(["ok": false, "error": "invalid"]) }
        do {
            let schema = try GenerationSchema(root: build(root), dependencies: [])
            let session = LanguageModelSession(model: model, instructions: request.instructions)
            let response = try await session.respond(to: request.prompt ?? "", schema: schema)
            let content = try JSONSerialization.jsonObject(with: Data(response.content.jsonString.utf8))
            emit(["ok": true, "content": content])
        } catch let error as LanguageModelSession.GenerationError {
            switch error {
            case .exceededContextWindowSize: emit(["ok": false, "error": "contextSizeExceeded"])
            case .guardrailViolation: emit(["ok": false, "error": "guardrailViolation"])
            case .assetsUnavailable: emit(["ok": false, "error": "modelNotReady"])
            default: emit(["ok": false, "error": "failed", "message": "\(error)"])
            }
        } catch {
            emit(["ok": false, "error": "failed", "message": "\(error)"])
        }
    default:
        emit(["ok": false, "error": "invalid"])
    }
}

@main
struct PondAppleModel {
    static func main() async {
        let input = FileHandle.standardInput.readDataToEndOfFile()
        guard let request = try? JSONDecoder().decode(Request.self, from: input) else {
            emit(["ok": false, "error": "invalid"])
        }
        if #available(macOS 26.0, *) {
            await run(request)
        }
        emit(["ok": false, "error": "unsupportedOS"])
    }
}
