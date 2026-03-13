class UploadResult {
  const UploadResult({
    required this.url,
    required this.name,
    required this.size,
    required this.mimeType,
  });

  final String url;
  final String name;
  final int size;
  final String mimeType;

  factory UploadResult.fromJson(Map<String, dynamic> json) {
    return UploadResult(
      url: json['url'] as String,
      name: json['name'] as String? ?? '',
      size: json['size'] as int? ?? 0,
      mimeType: json['mimeType'] as String? ?? '',
    );
  }
}
