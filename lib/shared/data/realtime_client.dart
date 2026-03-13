import 'dart:async';
import 'dart:convert';

import 'package:open_chat_circle/config/app_config.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class RealtimeClient {
  RealtimeClient(this._config);

  final AppConfig _config;
  WebSocketChannel? _channel;
  final _events = StreamController<Map<String, dynamic>>.broadcast();

  Stream<Map<String, dynamic>> get events => _events.stream;

  void connect(String token) {
    disconnect();
    final channel = WebSocketChannel.connect(
      Uri.parse('${_config.wsBaseUrl}/ws?token=$token'),
    );
    _channel = channel;
    channel.stream.listen((data) {
      _events.add(jsonDecode(data as String) as Map<String, dynamic>);
    });
  }

  void disconnect() {
    _channel?.sink.close();
    _channel = null;
  }

  void dispose() {
    disconnect();
    _events.close();
  }
}
