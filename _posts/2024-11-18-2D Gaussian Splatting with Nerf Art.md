---
layout: post
title: "2D Gaussian Splatting with Nerf Art"
date: 2024-11-18
excerpt: "2D Gaussian Splatting 기술과 Nerf Art 기슬을 결합해 보자"
tag: 
- 포트폴리오
- 과제
comments: true
published: true
project: true
---

# [2024-11-18] 2D Gaussian Splatting with Nerf Art

---

강의에서 논문을 따라 뭔가를 만들어 보라는 과제를 받고 어느 것을 해야할 지 고민하던 중 최근 Nerf라는 기술이 핫하다는 것을 알았다.

그리고 더 최신에는 Gaussian Splatting이 대세라는 것을 알게 됐고, 그 중 개선된 버전인 2D Gaussian Splatting을 타겟으로 선정했다.

단순히 모델을 학습하는 것은 누구나 할 수 있는 일이므로 어느 것을 더 해볼까 고민하던 중 Nerf-Art라는 논문을 보았다. Clip 모델을 이용해서 모델을 학습시킬 때 특정 스타일을 적용할 수 있다는 것이다.

만약 입력 텍스트로 "빈센트 반 고흐"를 넣으면, 사진의 모습을 구현할 때 Clip loss를 이용해서 해당 스타일대로 학습할 수 있다는 논문이었다. 개인적으로 눈에 사로잡힌 논문이어서 매우 즐겁게 과제를 수행할 수 있을 것이라 생각했다.

다만 문제가 있다면 Nerf-Art는 Nerf를 베이스로 한 논문이라는 건데... 다행히 Nerf와 마찬가지로 Gaussian Splatting에서도 생성된 image를 기반으로 loss를 계산하고 있는 듯 해서 큰 무리 없이 적용할 수 있었다.

다만 이를 적용하니 학습 속도가 말도 안되게 느려져서, 글을 쓰고 있는 현 시점에서는 이것을 해결하기 위한 방법을 찾고 있는 중이다. Gaussian Splatting은 생성 속도가 빠른게 장점인데 이렇게 되면 장점이 사라지니 해결해야만 한다...

[> Go](https://github.com/onetwohour/2d-gaussian-splatting-Art){: .btn}