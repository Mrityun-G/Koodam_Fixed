$urls = @{
  'welcome.html' = 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YjU5OTk4NWEyMjIwMjA3YWFlOTRjMDcxNzQ3EgsSBxC48ZK6_BcYAZIBJAoKcHJvamVjdF9pZBIWQhQxNDM0Mzc3MjAyMjE4ODAxMDQyMA&filename=&opi=89354086'
  'partner_dashboard.html' = 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YjU5OWEwOTNjNjIwMjJkNGMxZjQyMWJmYjliEgsSBxC48ZK6_BcYAZIBJAoKcHJvamVjdF9pZBIWQhQxNDM0Mzc3MjAyMjE4ODAxMDQyMA&filename=&opi=89354086'
  'user_home.html' = 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YjU5OTlmYThmMzcwNzc5OWU5MTUwMDI5YzFmEgsSBxC48ZK6_BcYAZIBJAoKcHJvamVjdF9pZBIWQhQxNDM0Mzc3MjAyMjE4ODAxMDQyMA&filename=&opi=89354086'
  'booking.html' = 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YjU5OWFiZjNhYmUwMzBmZDkxZjdkMDA3MmE1EgsSBxC48ZK6_BcYAZIBJAoKcHJvamVjdF9pZBIWQhQxNDM0Mzc3MjAyMjE4ODAxMDQyMA&filename=&opi=89354086'
  'live_tracking.html' = 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YjU5OWE0Y2NmZTIwMWE2MmVkNzZkMDQyMDBkEgsSBxC48ZK6_BcYAZIBJAoKcHJvamVjdF9pZBIWQhQxNDM0Mzc3MjAyMjE4ODAxMDQyMA&filename=&opi=89354086'
  'logo.svg' = 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YjU5OTY3MGZjOWYwNzllNmU1ZmQ0MTRlODdlEgsSBxC48ZK6_BcYAZIBJAoKcHJvamVjdF9pZBIWQhQxNDM0Mzc3MjAyMjE4ODAxMDQyMA&filename=&opi=89354086'
}

New-Item -ItemType Directory -Force -Path 'stitch_raw' | Out-Null
foreach ($key in $urls.Keys) {
  $out = "stitch_raw/$key"
  Invoke-WebRequest -Uri $urls[$key] -OutFile $out
  Write-Host "Saved $key"
}
