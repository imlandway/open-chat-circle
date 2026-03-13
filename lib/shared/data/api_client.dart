import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;
import 'package:open_chat_circle/config/app_config.dart';
import 'package:open_chat_circle/shared/core/app_exception.dart';

class ApiClient {
  ApiClient({
    required this.config,
    http.Client? client,
  }) : _client = client ?? http.Client();

  final AppConfig config;
  final http.Client _client;

  Map<String, String> _headers(String? token) {
    return {
      'Content-Type': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    return Uri.parse('${config.apiBaseUrl}$path').replace(
      queryParameters: query?.map((key, value) => MapEntry(key, '$value')),
    );
  }

  Future<Map<String, dynamic>> get(
    String path, {
    String? token,
    Map<String, dynamic>? query,
  }) async {
    final response = await _client.get(_uri(path, query), headers: _headers(token));
    return _decode(response);
  }

  Future<Map<String, dynamic>> post(
    String path, {
    String? token,
    Object? body,
  }) async {
    final response = await _client.post(
      _uri(path),
      headers: _headers(token),
      body: jsonEncode(body ?? const {}),
    );
    return _decode(response);
  }

  Future<Map<String, dynamic>> patch(
    String path, {
    String? token,
    Object? body,
  }) async {
    final response = await _client.patch(
      _uri(path),
      headers: _headers(token),
      body: jsonEncode(body ?? const {}),
    );
    return _decode(response);
  }

  Future<Map<String, dynamic>> uploadImage({
    required String token,
    required PlatformFile file,
  }) async {
    final request = http.MultipartRequest('POST', _uri('/api/uploads/images'));
    request.headers['Authorization'] = 'Bearer $token';

    if (file.bytes != null) {
      request.files.add(
        http.MultipartFile.fromBytes(
          'file',
          file.bytes!,
          filename: file.name,
        ),
      );
    } else if (file.path != null) {
      request.files.add(await http.MultipartFile.fromPath('file', file.path!));
    } else {
      throw const AppException('无法读取所选图片。');
    }

    final streamed = await request.send();
    final response = await http.Response.fromStream(streamed);
    return _decode(response);
  }

  Map<String, dynamic> _decode(http.Response response) {
    final body = response.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      throw AppException(body['message'] as String? ?? '请求失败。');
    }
    return body;
  }
}
